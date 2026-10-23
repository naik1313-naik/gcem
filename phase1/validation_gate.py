#!/usr/bin/env python3
"""
WindSage AI Phase 1 — Data Validation Gate

Ensures that invalid data is skipped and only valid data proceeds to
downstream bots (recurrence, sensor/anomaly, department classification).

Validation rules:
- alarm_id: required, 3–64 chars, alphanumeric + _ -
- turbine_id: required, 3–32 chars, alphanumeric + _ -
- alarm_code: required, 3–32 chars, alphanumeric + _ -
- description: required, 1–500 chars
- severity: must be Critical/High/Medium/Low
- status: must be Active/Acknowledged/Resolved
- timestamp: must be valid ISO 8601
- duration_min: must be 0–10,000
- sensor readings: optional but must be within valid ranges if present
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
import pandas as pd


@dataclass
class ValidationError:
    """A single validation error for a row."""
    row_index: int
    field: str
    message: str
    value: any = None


@dataclass
class ValidationResult:
    """Result of validating a dataset."""
    valid_rows: list[dict] = field(default_factory=list)
    invalid_rows: list[dict] = field(default_factory=list)
    errors: list[ValidationError] = field(default_factory=list)
    total_rows: int = 0
    valid_count: int = 0
    invalid_count: int = 0
    missing_values: dict = field(default_factory=dict)
    errors_by_reason: dict = field(default_factory=dict)

    @property
    def is_valid(self) -> bool:
        return self.invalid_count == 0

    def to_dict(self) -> dict:
        return {
            "total_rows": self.total_rows,
            "valid_count": self.valid_count,
            "invalid_count": self.invalid_count,
            "missing_values": self.missing_values,
            "errors_by_reason": self.errors_by_reason,
            "errors": [
                {"row_index": e.row_index, "field": e.field, "message": e.message, "value": e.value}
                for e in self.errors
            ],
            "invalid_rows": self.invalid_rows,
        }


VALID_SEVERITIES = {"Critical", "High", "Medium", "Low"}
VALID_STATUSES = {"Open", "Resolved", "Acknowledged", "In Progress", "Active"}


def is_missing(value):
    """Check if a value is missing (None, empty, or whitespace-only)."""
    return value is None or str(value).strip() == ""
VALID_ALARM_CODES = {"VIB-201", "TMP-310", "HYD-410", "COM-101", "PIT-220"}

SENSOR_RANGES = {
    "vibration_mm_s": (0, 100),
    "temperature_c": (-50, 200),
    "hydraulic_pressure_bar": (0, 500),
    "estimated_power_kw": (0, 10_000),
}


def validate_record(record: dict, row_index: int) -> list[ValidationError]:
    """Validate a single alarm record. Returns list of errors (empty if valid)."""
    errors = []

    # --- Required fields ---
    alarm_id = record.get("alarm_id")
    if not alarm_id or not str(alarm_id).strip():
        errors.append(ValidationError(row_index, "alarm_id", "alarm_id is required.", alarm_id))
    elif not (3 <= len(str(alarm_id).strip()) <= 64):
        errors.append(ValidationError(row_index, "alarm_id", "alarm_id must be 3–64 characters.", alarm_id))
    elif not str(alarm_id).strip().replace("_", "").replace("-", "").isalnum():
        errors.append(ValidationError(row_index, "alarm_id", "alarm_id must use only letters, numbers, _ or -.", alarm_id))

    turbine_id = record.get("turbine_id")
    if not turbine_id or not str(turbine_id).strip():
        errors.append(ValidationError(row_index, "turbine_id", "turbine_id is required.", turbine_id))
    elif not (3 <= len(str(turbine_id).strip()) <= 32):
        errors.append(ValidationError(row_index, "turbine_id", "turbine_id must be 3–32 characters.", turbine_id))
    elif not str(turbine_id).strip().replace("_", "").replace("-", "").isalnum():
        errors.append(ValidationError(row_index, "turbine_id", "turbine_id must use only letters, numbers, _ or -.", turbine_id))

    alarm_code = record.get("alarm_code")
    if not alarm_code or not str(alarm_code).strip():
        errors.append(ValidationError(row_index, "alarm_code", "alarm_code is required.", alarm_code))
    elif not (3 <= len(str(alarm_code).strip()) <= 32):
        errors.append(ValidationError(row_index, "alarm_code", "alarm_code must be 3–32 characters.", alarm_code))

    description = record.get("description")
    if not description or not str(description).strip():
        errors.append(ValidationError(row_index, "description", "description is required.", description))
    elif len(str(description).strip()) > 500:
        errors.append(ValidationError(row_index, "description", "description must be 500 characters or fewer.", description))

    # --- Enums ---
    severity = record.get("severity")
    if is_missing(severity):
        errors.append(ValidationError(row_index, "severity", "severity is required.", severity))
    elif str(severity).strip() not in VALID_SEVERITIES:
        errors.append(ValidationError(row_index, "severity", f"severity must be one of {sorted(VALID_SEVERITIES)}.", severity))

    status = record.get("status")
    if is_missing(status):
        errors.append(ValidationError(row_index, "status", "status is required.", status))
    elif str(status).strip() not in VALID_STATUSES:
        errors.append(ValidationError(row_index, "status", f"status must be one of {sorted(VALID_STATUSES)}.", status))

    # --- Timestamp ---
    timestamp = record.get("timestamp")
    if timestamp:
        try:
            pd.to_datetime(str(timestamp), utc=True)
        except Exception:
            errors.append(ValidationError(row_index, "timestamp", "timestamp must be a valid ISO 8601 date.", timestamp))
    else:
        errors.append(ValidationError(row_index, "timestamp", "timestamp is required.", timestamp))

    # --- Duration ---
    duration = record.get("duration_min")
    if duration is not None and duration != "":
        try:
            dur_val = float(duration)
            if dur_val < 0 or dur_val > 10_000:
                errors.append(ValidationError(row_index, "duration_min", "duration_min must be between 0 and 10000.", duration))
        except (ValueError, TypeError):
            errors.append(ValidationError(row_index, "duration_min", "duration_min must be a number.", duration))
    # duration_min is optional — if missing, it will be filled with 0 downstream

    # --- Optional sensor ranges ---
    for sensor_col, (min_val, max_val) in SENSOR_RANGES.items():
        val = record.get(sensor_col)
        if val is not None and val != "" and str(val).strip() != "":
            try:
                fval = float(val)
                if fval < min_val or fval > max_val:
                    errors.append(ValidationError(
                        row_index, sensor_col,
                        f"{sensor_col} must be between {min_val} and {max_val}.",
                        val,
                    ))
            except (ValueError, TypeError):
                errors.append(ValidationError(row_index, sensor_col, f"{sensor_col} must be a number.", val))

    return errors


def validate_dataset(records: list[dict]) -> ValidationResult:
    """
    Validate an entire dataset. Invalid rows are collected separately;
    only valid rows are returned in valid_rows.

    This is the validation GATE — downstream bots should only consume
    result.valid_rows.
    """
    result = ValidationResult()
    result.total_rows = len(records)

    # Track missing values across all records (required + optional fields)
    missing_fields = [
        "alarm_id", "turbine_id", "alarm_code", "description",
        "severity", "status", "timestamp", "duration_min",
        "vibration_mm_s", "temperature_c", "hydraulic_pressure_bar",
        "estimated_power_kw",
    ]
    missing_values = {f: 0 for f in missing_fields}

    for idx, record in enumerate(records):
        row_index = idx + 1  # 1-based for display
        errors = validate_record(record, row_index)

        if errors:
            result.invalid_rows.append(record)
            result.errors.extend(errors)
            result.invalid_count += 1
        else:
            # Normalize the valid record
            normalized = _normalize_record(record)
            result.valid_rows.append(normalized)
            result.valid_count += 1

        # Count missing values for all records (even invalid ones, per field)
        for field in missing_fields:
            val = record.get(field)
            if val is None or str(val).strip() == "":
                missing_values[field] += 1

    result.missing_values = missing_values

    # Group errors by reason (field name)
    errors_by_reason: dict = {}
    for e in result.errors:
        errors_by_reason[e.field] = errors_by_reason.get(e.field, 0) + 1
    result.errors_by_reason = errors_by_reason

    return result


def _normalize_record(record: dict) -> dict:
    """Normalize a valid record for downstream consumption."""
    ts = pd.to_datetime(str(record["timestamp"]), utc=True)
    duration = record.get("duration_min")
    try:
        dur_val = float(duration) if duration is not None and str(duration).strip() != "" else 0.0
    except (ValueError, TypeError):
        dur_val = 0.0
    return {
        "alarm_id": str(record["alarm_id"]).strip(),
        "turbine_id": str(record["turbine_id"]).strip(),
        "alarm_code": str(record["alarm_code"]).strip(),
        "description": str(record["description"]).strip(),
        "severity": str(record["severity"]).strip(),
        "status": str(record["status"]).strip(),
        "timestamp": ts.isoformat(),
        "duration_min": dur_val,
        "vibration_mm_s": float(record.get("vibration_mm_s", 0) or 0),
        "temperature_c": float(record.get("temperature_c", 0) or 0),
        "hydraulic_pressure_bar": float(record.get("hydraulic_pressure_bar", 170) or 170),
        "estimated_power_kw": float(record.get("estimated_power_kw", 2500) or 2500),
        "suggested_root_cause": record.get("suggested_root_cause") or "Not available in dataset",
        "source": record.get("source") or "csv",
    }


def gate_for_recurrence(records: list[dict]) -> tuple[list[dict], ValidationResult]:
    """
    Validation gate before recurrence detection.
    Returns (valid_records, validation_result).
    Only valid_records should be passed to the RecurrenceEngine.
    """
    result = validate_dataset(records)
    return result.valid_rows, result


def gate_for_sensor_anomaly(records: list[dict]) -> tuple[list[dict], ValidationResult]:
    """
    Validation gate before sensor/anomaly analysis.
    Returns (valid_records, validation_result).
    """
    result = validate_dataset(records)
    return result.valid_rows, result


def gate_for_department_classification(records: list[dict]) -> tuple[list[dict], ValidationResult]:
    """
    Validation gate before department classification.
    Returns (valid_records, validation_result).
    """
    result = validate_dataset(records)
    return result.valid_rows, result


def missing_value_total(missing_values: dict) -> int:
    """
    Compute total missing values across all fields.
    """
    return sum(missing_values.values()) if missing_values else 0


def summary_message(result: ValidationResult) -> str:
    """
    Build a human-readable validation summary message.
    """
    mv_total = missing_value_total(result.missing_values)
    return (
        f"Processed {result.total_rows} row(s); "
        f"{result.valid_count} valid, {result.invalid_count} invalid, "
        f"{mv_total} missing value(s)."
    )


if __name__ == "__main__":
    # Demo
    test_data = [
        {"alarm_id": "ALM-1", "turbine_id": "WT-03", "alarm_code": "VIB-201",
         "description": "Vibration high", "severity": "Critical", "status": "Active",
         "timestamp": "2026-10-20T06:15:00Z", "duration_min": 190, "vibration_mm_s": 11.4},
        {"alarm_id": "", "turbine_id": "WT-03", "alarm_code": "VIB-201",
         "description": "Missing ID", "severity": "Critical", "status": "Active",
         "timestamp": "2026-10-20T06:15:00Z", "duration_min": 100},  # INVALID: no alarm_id
        {"alarm_id": "ALM-3", "turbine_id": "WT-01", "alarm_code": "COM-101",
         "description": "Comm timeout", "severity": "Urgent", "status": "Active",
         "timestamp": "not-a-date", "duration_min": 25},  # INVALID: bad severity, bad timestamp
        {"alarm_id": "ALM-4", "turbine_id": "WT-05", "alarm_code": "TMP-310",
         "description": "Temp high", "severity": "High", "status": "Active",
         "timestamp": "2026-10-22T14:00:00Z", "duration_min": -5},  # INVALID: negative duration
    ]

    result = validate_dataset(test_data)
    print(f"Total: {result.total_rows}, Valid: {result.valid_count}, Invalid: {result.invalid_count}")
    print(f"\nValid rows (proceed to downstream bots): {len(result.valid_rows)}")
    for r in result.valid_rows:
        print(f"  ✓ {r['alarm_id']} | {r['turbine_id']} | {r['alarm_code']}")
    print(f"\nInvalid rows (skipped): {len(result.invalid_rows)}")
    for e in result.errors:
        print(f"  ✗ Row {e.row_index} [{e.field}]: {e.message}")
