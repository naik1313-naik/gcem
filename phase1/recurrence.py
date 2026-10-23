#!/usr/bin/env python3
"""
WindSage AI Phase 1 — Recurrence Calculation Engine

Computes alarm recurrence statistics from normalized alarm event data.
Pure Python/pandas implementation with no external ML dependencies.

Usage:
    from phase1.recurrence import RecurrenceEngine
    engine = RecurrenceEngine(df_alarms)
    stats = engine.compute_all()
    turbine_stats = engine.for_turbine("WT-03")
"""

from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd


@dataclass
class RecurrenceStats:
    """Recurrence statistics for a single (turbine_id, alarm_code) group."""
    turbine_id: str
    alarm_code: str
    alarm_description: str
    total_occurrences: int
    first_occurrence: datetime
    last_occurrence: datetime
    occurrences_24h: int
    occurrences_7d: int
    occurrences_30d: int
    mean_interval_h: Optional[float]
    median_interval_h: Optional[float]
    min_interval_h: Optional[float]
    max_interval_h: Optional[float]
    std_interval_h: Optional[float]
    burst_flag: bool
    burst_details: list  # list of (start, end, count) for each burst

    def to_dict(self) -> dict:
        return {
            "turbine_id": self.turbine_id,
            "alarm_code": self.alarm_code,
            "alarm_description": self.alarm_description,
            "total_occurrences": self.total_occurrences,
            "first_occurrence": self.first_occurrence.isoformat() if self.first_occurrence else None,
            "last_occurrence": self.last_occurrence.isoformat() if self.last_occurrence else None,
            "occurrences_24h": self.occurrences_24h,
            "occurrences_7d": self.occurrences_7d,
            "occurrences_30d": self.occurrences_30d,
            "mean_interval_h": self.mean_interval_h,
            "median_interval_h": self.median_interval_h,
            "min_interval_h": self.min_interval_h,
            "max_interval_h": self.max_interval_h,
            "std_interval_h": self.std_interval_h,
            "burst_flag": self.burst_flag,
            "burst_details": self.burst_details,
        }


class RecurrenceEngine:
    """
    Compute alarm recurrence statistics.

    Recurrence key: (turbine_id, alarm_code) — same fault mode on same turbine.
    Cross-turbine aggregation available via alarm_code only.
    """

    def __init__(
        self,
        df: pd.DataFrame,
        turbine_col: str = "turbine_id",
        code_col: str = "alarm_code",
        timestamp_col: str = "event_timestamp",
        description_col: str = "alarm_description",
        reference_time: Optional[datetime] = None,
    ):
        """
        Args:
            df: DataFrame with normalized alarm events
            turbine_col: Column name for turbine ID
            code_col: Column name for alarm code
            timestamp_col: Column name for event timestamp (must be timezone-aware)
            description_col: Column name for alarm description
            reference_time: Reference "now" for window calculations (default: UTC now)
        """
        self.df = df.copy()
        self.turbine_col = turbine_col
        self.code_col = code_col
        self.timestamp_col = timestamp_col
        self.description_col = description_col
        self.reference_time = reference_time or datetime.now(timezone.utc)

        # Validate required columns
        for col in [turbine_col, code_col, timestamp_col, description_col]:
            if col not in self.df.columns:
                raise ValueError(f"Required column not found: {col}")

        # Ensure timestamp is timezone-aware UTC
        if not pd.api.types.is_datetime64tz_dtype(self.df[timestamp_col]):
            self.df[timestamp_col] = pd.to_datetime(self.df[timestamp_col], utc=True)
        elif self.df[timestamp_col].dt.tz != timezone.utc:
            self.df[timestamp_col] = self.df[timestamp_col].dt.tz_convert(timezone.utc)

        # Sort by turbine, code, timestamp
        self.df = self.df.sort_values([turbine_col, code_col, timestamp_col]).reset_index(drop=True)

    def _compute_group_stats(self, group: pd.DataFrame, description: str) -> RecurrenceStats:
        """Compute stats for a single turbine+code group."""
        timestamps = group[self.timestamp_col].sort_values()

        total = len(timestamps)
        first = timestamps.iloc[0]
        last = timestamps.iloc[-1]

        # Window counts
        now = self.reference_time
        occ_24h = int((timestamps > (now - timedelta(hours=24))).sum())
        occ_7d = int((timestamps > (now - timedelta(days=7))).sum())
        occ_30d = int((timestamps > (now - timedelta(days=30))).sum())

        # Inter-event intervals
        intervals = timestamps.diff().dropna()
        intervals_h = intervals.dt.total_seconds() / 3600

        if len(intervals_h) > 0:
            mean_interval = float(intervals_h.mean())
            median_interval = float(intervals_h.median())
            min_interval = float(intervals_h.min())
            max_interval = float(intervals_h.max())
            std_interval = float(intervals_h.std()) if len(intervals_h) > 1 else 0.0
        else:
            mean_interval = median_interval = min_interval = max_interval = std_interval = None

        # Burst detection: >=3 events within 48h rolling window
        burst_details = []
        burst_flag = False
        if total >= 3:
            for i in range(total - 2):
                window_start = timestamps.iloc[i]
                window_end = window_start + timedelta(hours=48)
                window_count = int(((timestamps >= window_start) & (timestamps <= window_end)).sum())
                if window_count >= 3:
                    burst_flag = True
                    burst_details.append({
                        "window_start": window_start.isoformat(),
                        "window_end": window_end.isoformat(),
                        "event_count": window_count,
                    })

        return RecurrenceStats(
            turbine_id=group[self.turbine_col].iloc[0],
            alarm_code=group[self.code_col].iloc[0],
            alarm_description=description,
            total_occurrences=total,
            first_occurrence=first.to_pydatetime(),
            last_occurrence=last.to_pydatetime(),
            occurrences_24h=occ_24h,
            occurrences_7d=occ_7d,
            occurrences_30d=occ_30d,
            mean_interval_h=mean_interval,
            median_interval_h=median_interval,
            min_interval_h=min_interval,
            max_interval_h=max_interval,
            std_interval_h=std_interval,
            burst_flag=burst_flag,
            burst_details=burst_details,
        )

    def compute_all(self) -> list[RecurrenceStats]:
        """Compute recurrence stats for all (turbine, alarm_code) groups."""
        results = []
        for (turbine, code), group in self.df.groupby([self.turbine_col, self.code_col]):
            description = group[self.description_col].iloc[0]
            results.append(self._compute_group_stats(group, description))
        return results

    def compute_dataframe(self) -> pd.DataFrame:
        """Return recurrence stats as DataFrame."""
        stats = self.compute_all()
        return pd.DataFrame([s.to_dict() for s in stats])

    def for_turbine(self, turbine_id: str) -> list[RecurrenceStats]:
        """Get recurrence stats for a specific turbine."""
        return [s for s in self.compute_all() if s.turbine_id == turbine_id]

    def for_alarm_code(self, alarm_code: str) -> list[RecurrenceStats]:
        """Get recurrence stats for a specific alarm code across all turbines."""
        return [s for s in self.compute_all() if s.alarm_code == alarm_code]

    def top_recurring(self, n: int = 10, by: str = "total_occurrences") -> list[RecurrenceStats]:
        """Get top N most recurring alarm groups."""
        all_stats = self.compute_all()
        all_stats.sort(key=lambda s: getattr(s, by), reverse=True)
        return all_stats[:n]

    def compare_turbines(self, alarm_code: str) -> pd.DataFrame:
        """Compare recurrence of a specific alarm code across turbines."""
        stats = self.for_alarm_code(alarm_code)
        return pd.DataFrame([s.to_dict() for s in stats])

    def get_events(
        self,
        turbine_id: Optional[str] = None,
        alarm_code: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> pd.DataFrame:
        """Query raw events with filters."""
        df = self.df
        if turbine_id:
            df = df[df[self.turbine_col] == turbine_id]
        if alarm_code:
            df = df[df[self.code_col] == alarm_code]
        if start:
            df = df[df[self.timestamp_col] >= pd.Timestamp(start, tz="UTC")]
        if end:
            df = df[df[self.timestamp_col] <= pd.Timestamp(end, tz="UTC")]
        return df


def compute_cross_turbine_recurrence(
    df: pd.DataFrame,
    code_col: str = "alarm_code",
    timestamp_col: str = "event_timestamp",
    reference_time: Optional[datetime] = None,
) -> pd.DataFrame:
    """
    Compute recurrence aggregated across all turbines for each alarm_code.
    """
    ref = reference_time or datetime.now(timezone.utc)
    results = []

    for code, group in df.groupby(code_col):
        timestamps = group[timestamp_col].sort_values()
        total = len(timestamps)

        occ_24h = int((timestamps > (ref - timedelta(hours=24))).sum())
        occ_7d = int((timestamps > (ref - timedelta(days=7))).sum())
        occ_30d = int((timestamps > (ref - timedelta(days=30))).sum())

        turbines_affected = group["turbine_id"].nunique() if "turbine_id" in group.columns else 0

        results.append({
            "alarm_code": code,
            "alarm_description": group["alarm_description"].iloc[0] if "alarm_description" in group.columns else "",
            "total_occurrences": total,
            "turbines_affected": turbines_affected,
            "first_occurrence": timestamps.iloc[0].isoformat() if total > 0 else None,
            "last_occurrence": timestamps.iloc[-1].isoformat() if total > 0 else None,
            "occurrences_24h": occ_24h,
            "occurrences_7d": occ_7d,
            "occurrences_30d": occ_30d,
        })

    return pd.DataFrame(results)


# ──────────────────────────────────────────────────────────────────────────────
# Demo / CLI
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    from pathlib import Path

    # Load sample data
    sample_path = Path(__file__).parent.parent / "sample_data" / "synthetic_alarms.csv"
    if not sample_path.exists():
        sample_path = Path(__file__).parent.parent / "legacy" / "streamlit" / "sample_data" / "synthetic_alarms.csv"

    if sample_path.exists():
        df = pd.read_csv(sample_path)
        # Normalize column names to match expected
        df = df.rename(columns={
            "alarm_id": "event_id",
            "timestamp": "event_timestamp",
            "turbine_id": "turbine_id",
            "alarm_code": "alarm_code",
            "description": "alarm_description",
        })
        df["event_timestamp"] = pd.to_datetime(df["event_timestamp"], utc=True)

        engine = RecurrenceEngine(df)
        stats_df = engine.compute_dataframe()

        print("=== Recurrence Statistics ===")
        print(stats_df.to_string(index=False))

        print("\n=== Top 5 Recurring ===")
        top = engine.top_recurring(5)
        for s in top:
            print(f"  {s.turbine_id} | {s.alarm_code} | {s.total_occurrences} occurrences | last: {s.last_occurrence}")

        print("\n=== Cross-Turbine (VIB-201) ===")
        print(engine.compare_turbines("VIB-201").to_string(index=False))
    else:
        print(f"Sample data not found at {sample_path}", file=sys.stderr)
        sys.exit(1)