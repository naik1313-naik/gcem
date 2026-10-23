"""Tests for the Python validation gate."""
import sys
from pathlib import Path

# Add project root and phase1 to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "phase1"))

from validation_gate import validate_dataset, validate_record


def test_valid_record_passes():
    record = {
        "alarm_id": "ALM-1",
        "turbine_id": "WT-03",
        "alarm_code": "VIB-201",
        "description": "Drivetrain vibration above warning threshold",
        "severity": "Critical",
        "status": "Active",
        "timestamp": "2026-10-20T06:15:00Z",
        "duration_min": 190,
        "vibration_mm_s": 11.4,
    }
    result = validate_dataset([record])
    assert result.valid_count == 1
    assert result.invalid_count == 0
    assert len(result.errors) == 0


def test_missing_alarm_id_skipped():
    record = {
        "alarm_id": "",
        "turbine_id": "WT-03",
        "alarm_code": "VIB-201",
        "description": "Missing ID",
        "severity": "Critical",
        "status": "Active",
        "timestamp": "2026-10-20T06:15:00Z",
        "duration_min": 100,
    }
    result = validate_dataset([record])
    assert result.valid_count == 0
    assert result.invalid_count == 1
    assert any(e.field == "alarm_id" for e in result.errors)


def test_invalid_severity_skipped():
    record = {
        "alarm_id": "ALM-1",
        "turbine_id": "WT-03",
        "alarm_code": "VIB-201",
        "description": "Test",
        "severity": "Urgent",
        "status": "Active",
        "timestamp": "2026-10-20T06:15:00Z",
        "duration_min": 100,
    }
    result = validate_dataset([record])
    assert result.valid_count == 0
    assert any(e.field == "severity" for e in result.errors)


def test_invalid_timestamp_skipped():
    record = {
        "alarm_id": "ALM-1",
        "turbine_id": "WT-03",
        "alarm_code": "VIB-201",
        "description": "Test",
        "severity": "High",
        "status": "Active",
        "timestamp": "not-a-date",
        "duration_min": 100,
    }
    result = validate_dataset([record])
    assert result.valid_count == 0
    assert any(e.field == "timestamp" for e in result.errors)


def test_negative_duration_skipped():
    record = {
        "alarm_id": "ALM-1",
        "turbine_id": "WT-03",
        "alarm_code": "VIB-201",
        "description": "Test",
        "severity": "High",
        "status": "Active",
        "timestamp": "2026-10-20T06:15:00Z",
        "duration_min": -5,
    }
    result = validate_dataset([record])
    assert result.valid_count == 0
    assert any(e.field == "duration_min" for e in result.errors)


def test_out_of_range_sensor_skipped():
    record = {
        "alarm_id": "ALM-1",
        "turbine_id": "WT-03",
        "alarm_code": "VIB-201",
        "description": "Test",
        "severity": "High",
        "status": "Active",
        "timestamp": "2026-10-20T06:15:00Z",
        "duration_min": 100,
        "vibration_mm_s": 150,  # > 100 max
    }
    result = validate_dataset([record])
    assert result.valid_count == 0
    assert any(e.field == "vibration_mm_s" for e in result.errors)


def test_mixed_valid_invalid_only_valid_proceeds():
    records = [
        {
            "alarm_id": "ALM-1",
            "turbine_id": "WT-03",
            "alarm_code": "VIB-201",
            "description": "Vibration",
            "severity": "Critical",
            "status": "Active",
            "timestamp": "2026-10-20T06:15:00Z",
            "duration_min": 190,
        },
        {
            "alarm_id": "",  # invalid
            "turbine_id": "WT-03",
            "alarm_code": "VIB-201",
            "description": "Missing ID",
            "severity": "Critical",
            "status": "Active",
            "timestamp": "2026-10-20T06:15:00Z",
            "duration_min": 100,
        },
        {
            "alarm_id": "ALM-2",
            "turbine_id": "WT-07",
            "alarm_code": "HYD-410",
            "description": "Hydraulic",
            "severity": "High",
            "status": "Active",
            "timestamp": "2026-10-22T14:00:00Z",
            "duration_min": 95,
        },
    ]
    result = validate_dataset(records)
    assert result.total_rows == 3
    assert result.valid_count == 2
    assert result.invalid_count == 1
    valid_ids = [r["alarm_id"] for r in result.valid_rows]
    assert "ALM-1" in valid_ids
    assert "ALM-2" in valid_ids


def test_single_record_validation():
    record = {
        "alarm_id": "ALM-1",
        "turbine_id": "WT-03",
        "alarm_code": "VIB-201",
        "description": "Test",
        "severity": "High",
        "status": "Active",
        "timestamp": "2026-10-20T06:15:00Z",
        "duration_min": 100,
    }
    errors = validate_record(record, 1)
    assert errors == []

    bad_record = {**record, "alarm_id": ""}
    errors = validate_record(bad_record, 2)
    assert len(errors) > 0
    assert errors[0].row_index == 2


if __name__ == "__main__":
    test_valid_record_passes()
    test_missing_alarm_id_skipped()
    test_invalid_severity_skipped()
    test_invalid_timestamp_skipped()
    test_negative_duration_skipped()
    test_out_of_range_sensor_skipped()
    test_mixed_valid_invalid_only_valid_proceeds()
    test_single_record_validation()
    print("All Python validation gate tests passed!")
