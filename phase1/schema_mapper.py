#!/usr/bin/env python3
"""
WindSage AI Phase 1 — Schema Mapper

Handles column mapping between raw dataset schemas and the canonical WindSage
alarm schema. Also pivots long-format sensor data (sensor_type/sensor_value)
into wide-format sensor columns (vibration_mm_s, temperature_c, etc.).

Canonical schema columns:
  alarm_id, timestamp, turbine_id, alarm_code, description, severity,
  status, duration_min, vibration_mm_s, temperature_c,
  hydraulic_pressure_bar, estimated_power_kw

Sensor type → canonical column mapping:
  current → estimated_power_kw (current * voltage assumed, or raw value)
  vibration → vibration_mm_s
  temperature → temperature_c
  pressure → hydraulic_pressure_bar
  power → estimated_power_kw
"""

from dataclasses import dataclass, field
from typing import Optional
import pandas as pd
import numpy as np

# ── Column name aliases for auto-detection ──────────────────────────────

COLUMN_ALIASES: dict[str, list[str]] = {
    "alarm_id": ["alarm_id", "event_id", "id", "alarmid", "alarmId"],
    "timestamp": ["timestamp", "time", "datetime", "date_time", "date", "occurred_at", "created_at"],
    "turbine_id": ["turbine_id", "turbineid", "turbine", "wtg_id", "wtgid", "asset_id", "assetid", "unit_id", "unitid", "turbineId"],
    "alarm_code": ["alarm_code", "alarmcode", "code", "error_code", "errorcode", "fault_code", "faultcode", "alarm_type", "alarmtype"],
    "description": ["description", "desc", "message", "alarm_message", "alarmmessage", "details", "summary", "alarm_description"],
    "severity": ["severity", "level", "priority", "criticality", "sev"],
    "status": ["status", "state", "condition", "alarm_status", "alarmstatus"],
    "duration_min": ["duration_min", "durationmin", "duration", "duration_minutes", "minutes", "dur"],
    "sensor_id": ["sensor_id", "sensorid", "sensor", "tag", "tag_name", "tagname", "point_id", "pointid"],
    "sensor_type": ["sensor_type", "sensortype", "type", "measurement_type", "measurementtype"],
    "sensor_value": ["sensor_value", "sensorvalue", "value", "reading", "sensor_reading"],
    "sensor_unit": ["sensor_unit", "sensorunit", "unit"],
}

# Sensor type → canonical column mapping
SENSOR_TYPE_TO_COLUMN: dict[str, str] = {
    "vibration": "vibration_mm_s",
    "temperature": "temperature_c",
    "temp": "temperature_c",
    "pressure": "hydraulic_pressure_bar",
    "hydraulic_pressure": "hydraulic_pressure_bar",
    "current": "estimated_power_kw",
    "power": "estimated_power_kw",
    "pitch_angle": None,  # no canonical mapping, stored as-is
    "wind_speed": None,
    "communication_signal": None,
}

# Severity normalization (case-insensitive, variant handling)
SEVERITY_NORMALIZATION: dict[str, str] = {
    "critical": "Critical",
    "high": "High",
    "medium": "Medium",
    "low": "Low",
    "critical ": "Critical",
    "high ": "High",
    "medium ": "Medium",
    "low ": "Low",
    "CRITICAL": "Critical",
    "HIGH": "High",
    "MEDIUM": "Medium",
    "LOW": "Low",
}

# Status normalization
STATUS_NORMALIZATION: dict[str, str] = {
    "open": "Open",
    "resolved": "Resolved",
    "acknowledged": "Acknowledged",
    "in progress": "In Progress",
    "in_progress": "In Progress",
    "in-progress": "In Progress",
    "OPEN": "Open",
    "RESOLVED": "Resolved",
    "ACKNOWLEDGED": "Acknowledged",
}


@dataclass
class SchemaMappingResult:
    """Result of schema mapping and pivoting."""
    mapped_df: pd.DataFrame
    unmapped_columns: list[str]
    sensor_type_columns: dict[str, str]  # sensor_type → canonical column
    pivot_warnings: list[str]
    rows_dropped_due_to_pivot: int


@dataclass
class ColumnMapping:
    """User-defined or auto-detected column mapping."""
    source_to_canonical: dict[str, str]  # source column → canonical column
    canonical_required_missing: list[str]  # canonical required columns not mapped


def detect_column_mapping(
    df_columns: list[str],
    required_canonical: list[str],
) -> ColumnMapping:
    """
    Auto-detect column mapping from source DataFrame columns to canonical schema.
    Uses alias matching (case-insensitive, underscores ignored).
    """
    source_to_canonical: dict[str, str] = {}
    canonical_required_missing = list(required_canonical)

    # Normalize source column names for matching
    def normalize_col(name: str) -> str:
        return name.lower().replace("_", "").replace("-", "").replace(" ", "")

    norm_source_cols = {normalize_col(c): c for c in df_columns}

    for canonical_col, aliases in COLUMN_ALIASES.items():
        best_match = None
        for alias in aliases:
            norm_alias = normalize_col(alias)
            if norm_alias in norm_source_cols:
                best_match = norm_source_cols[norm_alias]
                break
        if best_match:
            source_to_canonical[best_match] = canonical_col
            if canonical_col in canonical_required_missing:
                canonical_required_missing.remove(canonical_col)

    return ColumnMapping(
        source_to_canonical=source_to_canonical,
        canonical_required_missing=canonical_required_missing,
    )


def apply_column_mapping(
    df: pd.DataFrame,
    mapping: ColumnMapping,
) -> pd.DataFrame:
    """Apply column mapping: rename source columns to canonical names."""
    result = df.copy()
    rename_map = {src: canon for src, canon in mapping.source_to_canonical.items()
                  if src in df.columns}
    result = result.rename(columns=rename_map)
    return result


def pivot_sensor_data(
    df: pd.DataFrame,
    sensor_type_col: str = "sensor_type",
    sensor_value_col: str = "sensor_value",
    sensor_id_col: Optional[str] = "sensor_id",
) -> tuple[pd.DataFrame, dict[str, str], list[str]]:
    """
    Pivot long-format sensor data into wide-format canonical columns.

    For each row, looks up sensor_type → canonical column mapping and places
    the sensor_value into the appropriate wide column. If a row's sensor_type
    has no canonical mapping, the value is stored as-is but not mapped to a
    canonical column.

    Returns (wide_df, sensor_type_columns, pivot_warnings).
    """
    if sensor_type_col not in df.columns or sensor_value_col not in df.columns:
        return df, {}, [f"Missing sensor columns ({sensor_type_col}, {sensor_value_col}); "
                        f"skipping sensor pivot."]

    result = df.copy()
    # Initialize canonical sensor columns with NaN
    canonical_sensor_cols = set(SENSOR_TYPE_TO_COLUMN.values()) - {None}
    for col in canonical_sensor_cols:
        if col not in result.columns:
            result[col] = np.nan

    sensor_type_columns: dict[str, str] = {}
    pivot_warnings: list[str] = []
    rows_dropped = 0

    # Group by row index and pivot
    for idx in result.index:
        stype = result.loc[idx, sensor_type_col]
        sval = result.loc[idx, sensor_value_col]

        if pd.isna(stype) or pd.isna(sval):
            continue

        stype_str = str(stype).strip().lower()
        canon_col = SENSOR_TYPE_TO_COLUMN.get(stype_str)

        if canon_col is None:
            # Sensor type has no canonical mapping — warn but don't crash
            if stype_str not in sensor_type_columns:
                sensor_type_columns[stype_str] = None
                pivot_warnings.append(
                    f"Sensor type '{stype}' has no canonical column mapping; "
                    f"value stored as-is."
                )
            continue

        sensor_type_columns[stype_str] = canon_col

        # Try to convert value to float
        try:
            fval = float(sval)
            if np.isnan(fval) or np.isinf(fval):
                result.loc[idx, canon_col] = np.nan
            else:
                result.loc[idx, canon_col] = fval
        except (ValueError, TypeError):
            # Non-numeric sensor value (e.g., "OK" for communication_signal)
            # Don't crash — leave as NaN in canonical column
            result.loc[idx, canon_col] = np.nan
            if stype_str not in pivot_warnings:
                pivot_warnings.append(
                    f"Non-numeric sensor value '{sval}' for type '{stype}' "
                    f"on row {idx}; canonical column '{canon_col}' left empty."
                )

    return result, sensor_type_columns, pivot_warnings


def normalize_severity_status(
    df: pd.DataFrame,
    severity_col: str = "severity",
    status_col: str = "status",
) -> tuple[pd.DataFrame, list[str]]:
    """
    Normalize severity and status values using known variants.
    Returns (normalized_df, normalization_warnings).
    """
    result = df.copy()
    warnings = []

    if severity_col in result.columns:
        orig_severity = result[severity_col].copy()
        result[severity_col] = result[severity_col].map(
            lambda v: SEVERITY_NORMALIZATION.get(str(v).strip(), str(v).strip())
        )
        # Check for unmapped values
        valid_set = {"Critical", "High", "Medium", "Low"}
        unmapped = result[~result[severity_col].isin(valid_set) & result[severity_col].notna()]
        for val in unmapped[severity_col].unique():
            warnings.append(
                f"Severity '{val}' not in known set {valid_set}; kept as-is."
            )

    if status_col in result.columns:
        orig_status = result[status_col].copy()
        result[status_col] = result[status_col].map(
            lambda v: STATUS_NORMALIZATION.get(str(v).strip(), str(v).strip())
        )
        valid_statuses = {"Open", "Resolved", "Acknowledged", "In Progress", "Active"}
        unmapped = result[~result[status_col].isin(valid_statuses) & result[status_col].notna()]
        for val in unmapped[status_col].unique():
            warnings.append(
                f"Status '{val}' not in known set {valid_statuses}; kept as-is."
            )

    return result, warnings


def fill_missing_duration(
    df: pd.DataFrame,
    duration_col: str = "duration_min",
) -> pd.DataFrame:
    """
    Fill missing duration_min with a default of 0 (safe conversion that
    preserves meaning: no duration recorded = 0 minutes).
    """
    result = df.copy()
    if duration_col in result.columns:
        result[duration_col] = result[duration_col].fillna(0)
    return result


def map_dataset(
    df: pd.DataFrame,
    user_mapping: Optional[dict[str, str]] = None,
) -> SchemaMappingResult:
    """
    Full schema mapping pipeline:
    1. Auto-detect column mapping
    2. Apply user overrides if provided
    3. Rename columns to canonical names
    4. Pivot long-format sensor data
    5. Normalize severity/status
    6. Fill missing duration

    Returns SchemaMappingResult with warnings about what was dropped/mapped.
    Required canonical columns (must be present or mappable):
    alarm_id, timestamp, turbine_id, alarm_code, description, severity, status.
    duration_min is optional and filled with 0 when missing.
    """
    required_canonical = ["alarm_id", "timestamp", "turbine_id", "alarm_code",
                          "description", "severity", "status"]

    # Step 1: Auto-detect mapping (case-insensitive, underscore/space-insensitive)
    mapping = detect_column_mapping(list(df.columns), required_canonical)

    # Step 2: Apply user overrides if provided
    if user_mapping:
        for src, canon in user_mapping.items():
            if src in df.columns:
                mapping.source_to_canonical[src] = canon
                if canon in mapping.canonical_required_missing:
                    mapping.canonical_required_missing.remove(canon)

    # Step 3: Apply column mapping
    result = apply_column_mapping(df, mapping)

    # Step 4: Check for missing required columns
    missing_required = [c for c in required_canonical if c not in result.columns]
    if missing_required:
        # Can't proceed without required columns — return early with clear warning
        return SchemaMappingResult(
            mapped_df=result,
            unmapped_columns=missing_required,
            sensor_type_columns={},
            pivot_warnings=[f"Missing required columns: {', '.join(missing_required)} "
                            f"(cannot proceed without these)"],
            rows_dropped_due_to_pivot=0,
        )

    # Step 5: Pivot sensor data (long → wide format)
    pivot_result, sensor_type_columns, pivot_warnings = pivot_sensor_data(result)

    # Step 6: Normalize severity/status
    normalized, norm_warnings = normalize_severity_status(pivot_result)
    pivot_warnings.extend(norm_warnings)

    # Step 7: Fill missing duration (optional, default 0)
    normalized = fill_missing_duration(normalized)

    # Determine unmapped columns (source columns not mapped to canonical)
    mapped_source_cols = set(mapping.source_to_canonical.keys())
    all_source_cols = set(df.columns)
    unmapped = list(all_source_cols - mapped_source_cols - set(pivot_warnings))

    return SchemaMappingResult(
        mapped_df=normalized,
        unmapped_columns=unmapped,
        sensor_type_columns=sensor_type_columns,
        pivot_warnings=pivot_warnings,
        rows_dropped_due_to_pivot=0,
    )


if __name__ == "__main__":
    import sys
    from pathlib import Path

    # Test with clean dataset
    df = pd.read_csv(Path(__file__).parent.parent / "sample_data" / "wind_turbine_demo_clean.csv")
    result = map_dataset(df)
    print(f"Mapped rows: {len(result.mapped_df)}")
    print(f"Columns: {list(result.mapped_df.columns)}")
    print(f"Unmapped columns: {result.unmapped_columns}")
    print(f"Sensor type mappings: {result.sensor_type_columns}")
    print(f"Warnings: {len(result.pivot_warnings)}")
    for w in result.pivot_warnings[:5]:
        print(f"  - {w}")
