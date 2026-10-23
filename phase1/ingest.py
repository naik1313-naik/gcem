#!/usr/bin/env python3
"""
WindSage AI Phase 1 — Data Ingestion & Preprocessing Pipeline

Handles:
- Loading raw CSV/Excel/JSON alarm data
- Schema mapping (auto-detect columns, pivot sensor data)
- Row-level validation — invalid rows are skipped, valid rows proceed
- Duplicate detection and deduplication
- Loading into PostgreSQL (Supabase) or local Parquet

Invalid rows are quarantined with row number, reason, and recommended
correction. Only valid data proceeds to downstream bots.

Usage:
    python -m phase1.ingest --input sample_data/wind_turbine_demo_clean.csv --output-parquet phase1/data/alarms.parquet
    python -m phase1.ingest --input sample_data/wind_turbine_demo_messy.csv --output-parquet phase1/data/alarms_messy.parquet
"""

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pandas as pd

from phase1.schema_mapper import map_dataset
from phase1.validation_gate import (
    validate_dataset,
    ValidationError,
    missing_value_total,
    summary_message,
)

# ──────────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────────

VALID_SEVERITIES = {"Critical", "High", "Medium", "Low"}
VALID_STATUSES = {"Open", "Resolved", "Acknowledged", "In Progress", "Active"}

DEFAULT_VALUES = {
    "vibration_mm_s": 0.0,
    "temperature_c": 0.0,
    "hydraulic_pressure_bar": 170.0,
    "estimated_power_kw": 2500.0,
    "suggested_root_cause": "Not available in dataset",
    "source": "csv",
}

# ──────────────────────────────────────────────────────────────────────────────
# Data Classes
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class IngestionReport:
    source_file: str
    timestamp: str
    rows_read: int
    rows_valid: int
    rows_invalid: int
    rows_duplicate: int
    rows_inserted: int
    errors: list
    warnings: list
    column_profile: dict
    schema_warnings: list = field(default_factory=list)
    sensor_type_mapping: dict = field(default_factory=dict)
    missing_values: dict = field(default_factory=dict)
    errors_by_reason: dict = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, default=str)


@dataclass
class DuplicateRecord:
    alarm_id: str
    reason: str
    original_index: int
    duplicate_index: int


# ──────────────────────────────────────────────────────────────────────────────
# Validation & Profiling
# ──────────────────────────────────────────────────────────────────────────────

def profile_dataframe(df: pd.DataFrame) -> dict:
    """Generate column-level profile statistics."""
    profile = {}
    for col in df.columns:
        col_data = df[col]
        profile[col] = {
            "dtype": str(col_data.dtype),
            "non_null": int(col_data.notna().sum()),
            "null_count": int(col_data.isna().sum()),
            "unique_count": int(col_data.nunique()),
            "sample_values": col_data.dropna().head(5).tolist(),
        }
        if pd.api.types.is_numeric_dtype(col_data):
            profile[col].update({
                "min": float(col_data.min()) if col_data.notna().any() else None,
                "max": float(col_data.max()) if col_data.notna().any() else None,
                "mean": float(col_data.mean()) if col_data.notna().any() else None,
            })
        elif pd.api.types.is_datetime64_any_dtype(col_data):
            profile[col].update({
                "min": str(col_data.min()) if col_data.notna().any() else None,
                "max": str(col_data.max()) if col_data.notna().any() else None,
            })
    return profile


def detect_duplicates(df: pd.DataFrame) -> tuple[pd.DataFrame, list[DuplicateRecord]]:
    """
    Detect duplicate alarm events.
    Duplicate definition: same alarm_id (primary key) OR same turbine+code+timestamp.
    Returns deduplicated dataframe and list of duplicates found.
    """
    if df.empty:
        return df, []

    duplicates = []

    # Check for exact alarm_id duplicates
    id_dupes = df[df.duplicated(subset=["alarm_id"], keep="first")]
    for idx in id_dupes.index:
        orig_idx = df[df["alarm_id"] == df.loc[idx, "alarm_id"]].index[0]
        duplicates.append(DuplicateRecord(
            alarm_id=df.loc[idx, "alarm_id"],
            reason="duplicate_alarm_id",
            original_index=int(orig_idx),
            duplicate_index=int(idx),
        ))

    # Check for same turbine+code+timestamp (same physical event recorded twice)
    event_dupes = df[df.duplicated(subset=["turbine_id", "alarm_code", "timestamp"], keep="first")]
    for idx in event_dupes.index:
        orig_idx = df[
            (df["turbine_id"] == df.loc[idx, "turbine_id"]) &
            (df["alarm_code"] == df.loc[idx, "alarm_code"]) &
            (df["timestamp"] == df.loc[idx, "timestamp"])
        ].index[0]
        if orig_idx != idx:  # Not already caught by alarm_id check
            duplicates.append(DuplicateRecord(
                alarm_id=df.loc[idx, "alarm_id"],
                reason="duplicate_turbine_code_timestamp",
                original_index=int(orig_idx),
                duplicate_index=int(idx),
            ))

    # Keep first occurrence
    df_dedup = df.drop_duplicates(subset=["alarm_id"], keep="first")
    df_dedup = df_dedup.drop_duplicates(subset=["turbine_id", "alarm_code", "timestamp"], keep="first")

    return df_dedup, duplicates


# ──────────────────────────────────────────────────────────────────────────────
# Main Ingestion Function
# ──────────────────────────────────────────────────────────────────────────────

def ingest_file(
    input_path: Path,
    output_parquet: Optional[Path] = None,
    output_db_url: Optional[str] = None,
    turbines_csv: Optional[Path] = None,
    user_column_mapping: Optional[dict[str, str]] = None,
    fail_on_validation: bool = True,
) -> IngestionReport:
    """
    Main ingestion pipeline.

    Steps:
    1. Load raw file (CSV/Excel/JSON)
    2. Schema mapping (auto-detect + pivot sensor data)
    3. Row-level validation gate — skip invalid rows, keep valid ones
    4. Duplicate detection on valid data only
    5. Output results
    """

    errors = []
    warnings = []

    # ── Step 1: Load source file ──────────────────────────────────────
    try:
        if input_path.suffix.lower() == ".csv":
            df_raw = pd.read_csv(input_path, dtype=str)
        elif input_path.suffix.lower() in [".xlsx", ".xls"]:
            df_raw = pd.read_excel(input_path, dtype=str)
        elif input_path.suffix.lower() == ".json":
            df_raw = pd.read_json(input_path, dtype=str)
        else:
            raise ValueError(f"Unsupported file format: {input_path.suffix}")
    except Exception as e:
        return IngestionReport(
            source_file=str(input_path),
            timestamp=datetime.now(timezone.utc).isoformat(),
            rows_read=0,
            rows_valid=0,
            rows_invalid=0,
            rows_duplicate=0,
            rows_inserted=0,
            errors=[f"Could not parse file: {e}"],
            warnings=[],
            column_profile={},
            schema_warnings=[f"File parse failed: {e}"],
        )

    rows_read = len(df_raw)
    column_profile = profile_dataframe(df_raw)

    # ── Step 2: Schema mapping ────────────────────────────────────────
    # Auto-detect column mapping, pivot sensor data, normalize severity/status
    mapping_result = map_dataset(df_raw, user_mapping=user_column_mapping)

    schema_warnings = list(mapping_result.pivot_warnings)
    if mapping_result.unmapped_columns:
        schema_warnings.append(
            f"Unmapped source columns (not mapped to canonical schema): "
            f"{', '.join(mapping_result.unmapped_columns)}"
        )

    df_mapped = mapping_result.mapped_df
    sensor_type_mapping = mapping_result.sensor_type_columns

    # ── Step 3: Validation gate ───────────────────────────────────────
    # Convert mapped dataframe to records for validation
    raw_records = df_mapped.to_dict("records")
    validation = validate_dataset(raw_records)

    valid_rows = validation.valid_rows
    invalid_rows = validation.invalid_rows  # QuarantinedRow list
    validation_errors = validation.errors

    # Build error messages
    errors = [f"Row {e.row_index} [{e.field}]: {e.message}" for e in validation_errors]

    # Missing value tracking
    missing_values = validation.missing_values
    missing_value_total_count = missing_value_total(missing_values)

    rows_valid = len(valid_rows)
    rows_invalid = len(invalid_rows)

    # Add schema validation summary
    if not validation.errors:
        warnings.append(
            f"All {rows_valid} row(s) passed validation."
        )
    else:
        warnings.append(
            f"Skipped {rows_invalid} invalid row(s); "
            f"{rows_valid} valid row(s) proceed to downstream bots. "
            f"Missing values: {missing_value_total_count}."
        )

    # Add schema warnings
    warnings.extend(schema_warnings)

    # ── Step 4: Build valid dataframe ─────────────────────────────────
    canonical_columns = [
        "alarm_id", "turbine_id", "alarm_code", "description", "severity",
        "status", "timestamp", "duration_min", "vibration_mm_s",
        "temperature_c", "hydraulic_pressure_bar", "estimated_power_kw",
        "suggested_root_cause", "source",
    ]

    if valid_rows:
        df_valid = pd.DataFrame(valid_rows)
        # Ensure only canonical columns exist
        for col in canonical_columns:
            if col not in df_valid.columns:
                df_valid[col] = None
        df_valid = df_valid[canonical_columns]
    else:
        df_valid = pd.DataFrame(columns=canonical_columns)

    # ── Step 5: Duplicate detection (only on valid data) ──────────────
    df_dedup, duplicates = detect_duplicates(df_valid)
    rows_duplicate = len(duplicates)
    rows_inserted = len(df_dedup)

    if duplicates:
        warnings.append(f"Found {len(duplicates)} duplicate record(s) (kept first occurrence)")
        for dup in duplicates:
            warnings.append(f"  Duplicate: {dup.alarm_id} — {dup.reason}")

    # ── Output ────────────────────────────────────────────────────────
    if output_parquet:
        output_parquet.parent.mkdir(parents=True, exist_ok=True)
        df_dedup.to_parquet(output_parquet, index=False)
        print(f"Written {rows_inserted} records to {output_parquet}")

    if output_db_url:
        warnings.append("PostgreSQL output not yet implemented — use --output-parquet for now")

    report = IngestionReport(
        source_file=str(input_path),
        timestamp=datetime.now(timezone.utc).isoformat(),
        rows_read=rows_read,
        rows_valid=rows_valid,
        rows_invalid=rows_invalid,
        rows_duplicate=rows_duplicate,
        rows_inserted=rows_inserted,
        errors=errors,
        warnings=warnings,
        column_profile=column_profile,
        schema_warnings=schema_warnings,
        sensor_type_mapping=sensor_type_mapping,
        missing_values=missing_values,
        errors_by_reason=validation.errors_by_reason,
    )

    return report


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="WindSage AI Phase 1 Data Ingestion")
    parser.add_argument("--input", required=True, help="Input CSV/Excel/JSON file")
    parser.add_argument("--output-parquet", help="Output Parquet file path")
    parser.add_argument("--output-db", help="PostgreSQL connection URL (not yet implemented)")
    parser.add_argument("--turbines-csv", help="Optional turbine metadata CSV with id,site columns")
    parser.add_argument("--report-json", help="Write ingestion report to JSON file")
    parser.add_argument(
        "--no-fail-on-validation",
        action="store_true",
        help="Exit 0 even if validation errors exist (useful for messy demo data)",
    )

    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    report = ingest_file(
        input_path=input_path,
        output_parquet=Path(args.output_parquet) if args.output_parquet else None,
        output_db_url=args.output_db,
        turbines_csv=Path(args.turbines_csv) if args.turbines_csv else None,
    )

    print(report.to_json())

    if args.report_json:
        Path(args.report_json).write_text(report.to_json())
        print(f"Report written to {args.report_json}")

    # Exit with error code if any validation errors (unless --no-fail-on-validation)
    if report.errors and not args.no_fail_on_validation:
        sys.exit(1)


if __name__ == "__main__":
    main()
