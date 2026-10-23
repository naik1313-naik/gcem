#!/usr/bin/env python3
"""
Tests for module error isolation and model input validation.

Covers requirement-7 scenarios:
- One module failing while other modules continue to work
- Missing or incompatible model files
- Model input validation (required columns/features before inference)
"""

import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "phase1"))

import pandas as pd
from phase1.validation_gate import validate_dataset, gate_for_recurrence, gate_for_sensor_anomaly, gate_for_department_classification
from phase1.baseline import StatisticalBaseline, assess_ml_readiness
from phase1.department_classifier import recommend_department
from phase1.recurrence import RecurrenceEngine


# ── Helpers ──────────────────────────────────────────────────────────────

def valid_alarm_records(n=5):
    """Return n valid alarm records."""
    base = {
        "turbine_id": "WT-03",
        "alarm_code": "VIB-201",
        "description": "Drivetrain vibration",
        "severity": "High",
        "status": "Active",
        "timestamp": "2026-10-20T06:15:00Z",
        "duration_min": 100,
        "vibration_mm_s": 11.4,
        "temperature_c": 70,
        "hydraulic_pressure_bar": 170,
        "estimated_power_kw": 2500,
    }
    records = []
    for i in range(n):
        r = dict(base)
        r["alarm_id"] = f"ALM-{1000 + i}"
        r["timestamp"] = f"2026-10-20T06:{15 + i}:00Z"
        records.append(r)
    return records


# ── Module error isolation ─────────────────────────────────────────────

def test_recurrence_continues_when_sensor_anomaly_skipped():
    """If sensor/anomaly module has insufficient data, recurrence still works."""
    records = valid_alarm_records(3)
    valid_rows, val_result = gate_for_recurrence(records)
    assert val_result.valid_count == 3

    # Recurrence engine should work on valid data
    df = pd.DataFrame(valid_rows)
    df = df.rename(columns={"timestamp": "event_timestamp", "description": "alarm_description"})
    df["event_timestamp"] = pd.to_datetime(df["event_timestamp"], utc=True)
    engine = RecurrenceEngine(df)
    stats = engine.compute_all()
    assert len(stats) >= 1

    # Statistical baseline should also work (no ML)
    baseline = StatisticalBaseline(df, baseline_window_days=30)
    bl_stats = baseline.compute_baseline()
    assert len(bl_stats) >= 1

    # ML readiness should report False (insufficient data)
    readiness = assess_ml_readiness(df)
    assert readiness["ml_ready"] is False


def test_department_classification_always_works():
    """Department classification uses rule-based mappings, never crashes."""
    records = valid_alarm_records(3)
    valid_rows, val_result = gate_for_department_classification(records)
    assert val_result.valid_count == 3

    for row in valid_rows:
        rec = recommend_department(row["alarm_code"], row["description"])
        assert rec.recommended_department is not None
        assert rec.review_status == "pending"
        assert rec.is_provisional is True


def test_invalid_rows_do_not_crash_downstream_modules():
    """Invalid rows are skipped; downstream modules only see valid data."""
    records = [
        {**valid_alarm_records(1)[0], "alarm_id": ""},  # invalid
        {**valid_alarm_records(1)[0], "alarm_id": "ALM-2", "severity": "Urgent"},  # invalid
        valid_alarm_records(1)[0],  # valid
    ]
    valid_rows, val_result = gate_for_recurrence(records)
    assert val_result.valid_count == 1
    assert val_result.invalid_count == 2
    assert valid_rows[0]["alarm_id"] == "ALM-1000"


# ── Model input validation ──────────────────────────────────────────────

def test_baseline_raises_on_missing_required_columns():
    """StatisticalBaseline validates required columns before processing."""
    df = pd.DataFrame({"alarm_id": ["ALM-1"], "turbine_id": ["WT-03"]})
    try:
        StatisticalBaseline(df)
        assert False, "Should have raised ValueError for missing columns"
    except ValueError as e:
        assert "Required column not found" in str(e)


def test_assess_ml_readiness_handles_empty_dataframe():
    """ML readiness assessment handles empty data gracefully."""
    df = pd.DataFrame(columns=["alarm_id", "turbine_id", "alarm_code", "event_timestamp"])
    df["event_timestamp"] = pd.to_datetime(df["event_timestamp"], utc=True)
    assessment = assess_ml_readiness(df)
    assert assessment["ml_ready"] is False
    assert assessment["total_events"] == 0
    assert assessment["n_turbines"] == 0


def test_assess_ml_readiness_handles_insufficient_data():
    """ML readiness correctly reports insufficient data."""
    records = valid_alarm_records(3)
    df = pd.DataFrame(records)
    df = df.rename(columns={"timestamp": "event_timestamp"})
    df["event_timestamp"] = pd.to_datetime(df["event_timestamp"], utc=True)
    assessment = assess_ml_readiness(df)
    assert assessment["ml_ready"] is False
    assert "Insufficient data" in assessment["recommendation"]


def test_department_classifier_handles_unknown_alarm_code():
    """Unknown alarm codes route to Human Review without crashing."""
    rec = recommend_department("UNKNOWN-999", "Some weird alarm")
    assert rec.recommended_department == "Unknown / Human Review"
    assert rec.confidence == 0.0
    assert rec.review_status == "pending"


def test_department_classifier_handles_empty_description():
    """Empty description falls back to alarm code mapping."""
    rec = recommend_department("VIB-201", "")
    assert rec.recommended_department == "Mechanical Engineering"
    assert rec.confidence == 0.85


if __name__ == "__main__":
    test_recurrence_continues_when_sensor_anomaly_skipped()
    test_department_classification_always_works()
    test_invalid_rows_do_not_crash_downstream_modules()
    test_baseline_raises_on_missing_required_columns()
    test_assess_ml_readiness_handles_empty_dataframe()
    test_assess_ml_readiness_handles_insufficient_data()
    test_department_classifier_handles_unknown_alarm_code()
    test_department_classifier_handles_empty_description()
    print("All module error isolation and model input validation tests passed!")
