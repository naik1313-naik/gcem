#!/usr/bin/env python3
"""
WindSage AI Phase 1 — Maintenance Department Classification Bot

Recommends which engineering department should investigate an alarm.

IMPORTANT: No verified department labels exist in the current dataset.
This module uses documented alarm-to-department mappings as provisional
rule-based suggestions. All outputs are clearly marked as provisional
and route uncertain predictions to Human Review.

Target departments:
- Electrical Engineering
- Mechanical Engineering
- Controls/Software Engineering
- Instrumentation Engineering
- Unknown / Human Review
"""

from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class DepartmentRecommendation:
    """Department recommendation for an alarm."""
    alarm_code: str
    alarm_description: str
    recommended_department: str
    confidence: float  # 0.0 - 1.0
    is_provisional: bool  # True when based on documented mapping, not trained model
    evidence: str
    review_status: str  # "pending", "accepted", "overridden"
    override_department: Optional[str] = None
    override_reason: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


# Documented alarm code → department mapping
# These are provisional rules based on domain knowledge, NOT trained on labeled data.
ALARM_CODE_DEPARTMENT_MAP: dict[str, dict] = {
    "VIB-201": {
        "department": "Mechanical Engineering",
        "confidence": 0.85,
        "evidence": "Vibration alarm on drivetrain — mechanical rotating equipment issue.",
    },
    "TMP-310": {
        "department": "Mechanical Engineering",
        "confidence": 0.80,
        "evidence": "Gearbox oil temperature high — mechanical thermal/lubrication issue.",
    },
    "HYD-410": {
        "department": "Mechanical Engineering",
        "confidence": 0.85,
        "evidence": "Hydraulic pressure outside band — mechanical fluid power system issue.",
    },
    "PIT-220": {
        "department": "Electrical Engineering",
        "confidence": 0.80,
        "evidence": "Pitch actuator response slow — electrical actuator/motor control issue.",
    },
    "COM-101": {
        "department": "Controls/Software Engineering",
        "confidence": 0.90,
        "evidence": "Controller communication timeout — SCADA/network communication issue.",
    },
}


def recommend_department(
    alarm_code: str,
    alarm_description: str = "",
    sensor_readings: Optional[dict] = None,
) -> DepartmentRecommendation:
    """
    Recommend a maintenance department for an alarm.

    Uses documented alarm-to-department mappings. No ML training is performed
    because no verified department labels exist in the dataset.

    Args:
        alarm_code: The alarm code (e.g., "VIB-201").
        alarm_description: Human-readable alarm description.
        sensor_readings: Optional sensor readings (vibration, temperature, etc.)
            that may refine the recommendation.

    Returns:
        DepartmentRecommendation with provisional mapping, evidence, and
        review status set to "pending".
    """
    code_upper = alarm_code.upper().strip()

    if code_upper in ALARM_CODE_DEPARTMENT_MAP:
        mapping = ALARM_CODE_DEPARTMENT_MAP[code_upper]
        return DepartmentRecommendation(
            alarm_code=alarm_code,
            alarm_description=alarm_description or mapping["evidence"],
            recommended_department=mapping["department"],
            confidence=mapping["confidence"],
            is_provisional=True,
            evidence=mapping["evidence"],
            review_status="pending",
        )

    # Fallback: heuristic based on description keywords
    desc_lower = (alarm_description or "").lower()
    if any(kw in desc_lower for kw in ["vibration", "bearing", "gearbox", "rotor", "drivetrain"]):
        return DepartmentRecommendation(
            alarm_code=alarm_code,
            alarm_description=alarm_description,
            recommended_department="Mechanical Engineering",
            confidence=0.60,
            is_provisional=True,
            evidence="Description keywords suggest mechanical equipment issue.",
            review_status="pending",
        )
    if any(kw in desc_lower for kw in ["temperature", "thermal", "oil", "cooling", "heat"]):
        return DepartmentRecommendation(
            alarm_code=alarm_code,
            alarm_description=alarm_description,
            recommended_department="Mechanical Engineering",
            confidence=0.55,
            is_provisional=True,
            evidence="Description keywords suggest thermal/mechanical issue.",
            review_status="pending",
        )
    if any(kw in desc_lower for kw in ["pressure", "hydraulic", "leak", "pump", "flow"]):
        return DepartmentRecommendation(
            alarm_code=alarm_code,
            alarm_description=alarm_description,
            recommended_department="Mechanical Engineering",
            confidence=0.55,
            is_provisional=True,
            evidence="Description keywords suggest hydraulic/fluid system issue.",
            review_status="pending",
        )
    if any(kw in desc_lower for kw in ["communication", "network", "controller", "timeout", "scada"]):
        return DepartmentRecommendation(
            alarm_code=alarm_code,
            alarm_description=alarm_description,
            recommended_department="Controls/Software Engineering",
            confidence=0.60,
            is_provisional=True,
            evidence="Description keywords suggest communication/control issue.",
            review_status="pending",
        )
    if any(kw in desc_lower for kw in ["pitch", "actuator", "motor", "electrical", "power"]):
        return DepartmentRecommendation(
            alarm_code=alarm_code,
            alarm_description=alarm_description,
            recommended_department="Electrical Engineering",
            confidence=0.55,
            is_provisional=True,
            evidence="Description keywords suggest electrical/actuator issue.",
            review_status="pending",
        )
    if any(kw in desc_lower for kw in ["sensor", "transducer", "instrument", "reading", "gauge"]):
        return DepartmentRecommendation(
            alarm_code=alarm_code,
            alarm_description=alarm_description,
            recommended_department="Instrumentation Engineering",
            confidence=0.55,
            is_provisional=True,
            evidence="Description keywords suggest instrumentation/sensor issue.",
            review_status="pending",
        )

    # Unknown → Human Review
    return DepartmentRecommendation(
        alarm_code=alarm_code,
        alarm_description=alarm_description,
        recommended_department="Unknown / Human Review",
        confidence=0.0,
        is_provisional=True,
        evidence="No documented mapping or keyword match found. Requires human review.",
        review_status="pending",
    )


def accept_recommendation(
    rec: DepartmentRecommendation,
    reviewer: str,
    override_department: Optional[str] = None,
    override_reason: Optional[str] = None,
) -> DepartmentRecommendation:
    """
    Record operator acceptance or override of a department recommendation.

    Args:
        rec: The original recommendation.
        reviewer: Name/ID of the operator reviewing.
        override_department: If different from recommended, the overridden department.
        override_reason: Reason for the override.

    Returns:
        Updated DepartmentRecommendation with review status.
    """
    rec.review_status = "accepted" if not override_department else "overridden"
    rec.reviewed_by = reviewer
    from datetime import datetime, timezone
    rec.reviewed_at = datetime.now(timezone.utc).isoformat()
    if override_department:
        rec.override_department = override_department
        rec.override_reason = override_reason
    return rec


def get_all_mappings() -> list[dict]:
    """Return all documented alarm-to-department mappings for display."""
    return [
        {
            "alarm_code": code,
            "department": mapping["department"],
            "confidence": mapping["confidence"],
            "evidence": mapping["evidence"],
            "is_provisional": True,
        }
        for code, mapping in ALARM_CODE_DEPARTMENT_MAP.items()
    ]


if __name__ == "__main__":
    # Demo
    test_alarms = [
        ("VIB-201", "Drivetrain vibration above warning threshold"),
        ("TMP-310", "Gearbox oil temperature high"),
        ("HYD-410", "Hydraulic pressure outside operating band"),
        ("PIT-220", "Pitch actuator response slow"),
        ("COM-101", "Controller communication timeout"),
        ("UNK-999", "Unknown sensor fault"),
    ]
    print("=== Department Classification Demo ===\n")
    for code, desc in test_alarms:
        rec = recommend_department(code, desc)
        print(f"  {code}: {rec.recommended_department}")
        print(f"    Confidence: {rec.confidence:.0%} | Provisional: {rec.is_provisional}")
        print(f"    Evidence: {rec.evidence}")
        print(f"    Review: {rec.review_status}")
        print()