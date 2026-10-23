#!/usr/bin/env python3
"""
WindSage AI Phase 1 — Query Interface

Provides a structured query interface for the alarm intelligence bot.
Supports natural-language-style questions translated to database queries.
"""

from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from typing import Optional

import pandas as pd

from phase1.recurrence import RecurrenceEngine
from phase1.baseline import StatisticalBaseline
from phase1.mapping import MappingCatalog, enrich_alarm_with_mapping, create_default_catalog


@dataclass
class QueryResult:
    """Result of a query execution."""
    query_type: str
    question: str
    answer: str
    data: list  # List of dicts for tabular results
    metadata: dict
    warnings: list = None

    def to_dict(self) -> dict:
        d = asdict(self)
        if self.warnings is None:
            d["warnings"] = []
        return d


class AlarmQueryEngine:
    """
    High-level query engine that combines recurrence, baseline, and mapping.
    """

    def __init__(
        self,
        df: pd.DataFrame,
        catalog: Optional[MappingCatalog] = None,
        reference_time: Optional[datetime] = None,
    ):
        """
        Args:
            df: Normalized alarm events DataFrame
            catalog: Optional MappingCatalog (creates default if None)
            reference_time: Reference "now" for window calculations
        """
        self.df = df
        self.catalog = catalog or create_default_catalog()
        self.reference_time = reference_time or datetime.now(timezone.utc)

        # Initialize sub-engines
        self.recurrence = RecurrenceEngine(df, reference_time=self.reference_time)
        self.baseline = StatisticalBaseline(df, reference_time=self.reference_time)

    # ──────────────────────────────────────────────────────────────────────────
    # Core Query Methods
    # ──────────────────────────────────────────────────────────────────────────

    def which_alarms_recurred_most(self, turbine_id: str, n: int = 10) -> QueryResult:
        """'Which alarms recurred most often on WT-003?'"""
        stats = self.recurrence.for_turbine(turbine_id)
        stats.sort(key=lambda s: s.total_occurrences, reverse=True)
        top = stats[:n]

        data = [s.to_dict() for s in top]
        if not data:
            answer = f"No alarms found for turbine {turbine_id}."
        else:
            lines = [f"Top {len(top)} recurring alarms on {turbine_id}:"]
            for s in top:
                lines.append(f"  {s.alarm_code} ({s.alarm_description}): {s.total_occurrences} occurrences, last {s.last_occurrence}")
            answer = "\n".join(lines)

        return QueryResult(
            query_type="top_recurring_turbine",
            question=f"Which alarms recurred most often on {turbine_id}?",
            answer=answer,
            data=data,
            metadata={"turbine_id": turbine_id, "n": n},
        )

    def count_alarm_in_range(
        self,
        alarm_code: str,
        start: datetime,
        end: datetime,
        turbine_id: Optional[str] = None,
    ) -> QueryResult:
        """'How many times did alarm ALM-104 occur between two dates?'"""
        events = self.recurrence.get_events(
            turbine_id=turbine_id,
            alarm_code=alarm_code,
            start=start,
            end=end,
        )

        count = len(events)
        turbine_str = f" on {turbine_id}" if turbine_id else " across all turbines"
        answer = f"Alarm {alarm_code} occurred {count} time(s){turbine_str} between {start.date()} and {end.date()}."

        data = events.to_dict("records") if count > 0 else []

        return QueryResult(
            query_type="count_alarm_range",
            question=f"How many times did alarm {alarm_code} occur between {start.date()} and {end.date()}{turbine_str}?",
            answer=answer,
            data=data,
            metadata={
                "alarm_code": alarm_code,
                "turbine_id": turbine_id,
                "start": start.isoformat(),
                "end": end.isoformat(),
                "count": count,
            },
        )

    def which_sensor_reported(self, alarm_code: str, turbine_id: str) -> QueryResult:
        """'Which sensor reported this alarm?'"""
        sensor_id, sensor_type, sensor_location = self.catalog.get_sensor_for_alarm(alarm_code, turbine_id)
        mapping = self.catalog.get_alarm_mapping(alarm_code)

        answer = (
            f"Alarm {alarm_code} on {turbine_id} is associated with:\n"
            f"  Sensor Type: {sensor_type}\n"
            f"  Sensor ID: {sensor_id}\n"
            f"  Location: {sensor_location}\n"
            f"  Notes: {mapping.notes}"
        )

        return QueryResult(
            query_type="sensor_for_alarm",
            question=f"Which sensor reported alarm {alarm_code} on {turbine_id}?",
            answer=answer,
            data=[{
                "alarm_code": alarm_code,
                "turbine_id": turbine_id,
                "sensor_id": sensor_id,
                "sensor_type": sensor_type,
                "sensor_location": sensor_location,
                "notes": mapping.notes,
            }],
            metadata={"alarm_code": alarm_code, "turbine_id": turbine_id},
            warnings=["Sensor metadata not available in dataset"] if sensor_id == "Unknown — not available in dataset" else [],
        )

    def where_is_sensor_located(self, alarm_code: str, turbine_id: str) -> QueryResult:
        """'Where is that sensor located on the turbine?'"""
        sensor_id, sensor_type, sensor_location = self.catalog.get_sensor_for_alarm(alarm_code, turbine_id)

        answer = f"The sensor for alarm {alarm_code} on {turbine_id} is located at: {sensor_location}"

        return QueryResult(
            query_type="sensor_location",
            question=f"Where is the sensor for alarm {alarm_code} on {turbine_id} located?",
            answer=answer,
            data=[{
                "alarm_code": alarm_code,
                "turbine_id": turbine_id,
                "sensor_id": sensor_id,
                "sensor_type": sensor_type,
                "sensor_location": sensor_location,
            }],
            metadata={"alarm_code": alarm_code, "turbine_id": turbine_id},
            warnings=["Sensor location not available in dataset"] if sensor_location == "Unknown — not available in dataset" else [],
        )

    def first_and_recent(self, alarm_code: str, turbine_id: Optional[str] = None) -> QueryResult:
        """'Show the first and most recent occurrence.'"""
        if turbine_id:
            stats = self.recurrence.for_turbine(turbine_id)
            stats = [s for s in stats if s.alarm_code == alarm_code]
        else:
            stats = self.recurrence.for_alarm_code(alarm_code)

        if not stats:
            answer = f"No occurrences found for alarm {alarm_code}{' on ' + turbine_id if turbine_id else ''}."
            data = []
        else:
            s = stats[0]
            answer = (
                f"Alarm {alarm_code} on {s.turbine_id}:\n"
                f"  First occurrence: {s.first_occurrence}\n"
                f"  Most recent: {s.last_occurrence}\n"
                f"  Total occurrences: {s.total_occurrences}"
            )
            data = [s.to_dict()]

        return QueryResult(
            query_type="first_recent",
            question=f"Show first and most recent occurrence of {alarm_code}{' on ' + turbine_id if turbine_id else ''}",
            answer=answer,
            data=data,
            metadata={"alarm_code": alarm_code, "turbine_id": turbine_id},
        )

    def compare_recurrence_across_turbines(self, alarm_code: str) -> QueryResult:
        """'Compare recurrence across turbines.'"""
        df = self.recurrence.compare_turbines(alarm_code)

        if df.empty:
            answer = f"No occurrences of {alarm_code} found on any turbine."
            data = []
        else:
            lines = [f"Recurrence of {alarm_code} across turbines:"]
            for _, row in df.iterrows():
                lines.append(
                    f"  {row['turbine_id']}: {row['total_occurrences']} occurrences, "
                    f"last {row['last_occurrence']}, "
                    f"7d rate: {row['occurrences_7d']}, "
                    f"30d rate: {row['occurrences_30d']}"
                )
            answer = "\n".join(lines)
            data = df.to_dict("records")

        return QueryResult(
            query_type="compare_turbines",
            question=f"Compare recurrence of {alarm_code} across turbines",
            answer=answer,
            data=data,
            metadata={"alarm_code": alarm_code},
        )

    def alarms_from_sensor_last_days(
        self,
        sensor_type: str,
        turbine_id: str,
        days: int = 7,
    ) -> QueryResult:
        """'Show all alarms from this sensor in the last 7 days.'"""
        # Find alarm codes that map to this sensor type
        matching_codes = [
            code for code, mapping in self.catalog.alarm_mappings.items()
            if mapping.primary_sensor_type == sensor_type
        ]

        if not matching_codes:
            answer = f"No alarm codes mapped to sensor type '{sensor_type}'."
            return QueryResult(
                query_type="sensor_alarms_recent",
                question=f"Show alarms from {sensor_type} sensor on {turbine_id} in last {days} days",
                answer=answer,
                data=[],
                metadata={"sensor_type": sensor_type, "turbine_id": turbine_id, "days": days},
                warnings=[f"No alarm codes mapped to sensor type: {sensor_type}"],
            )

        start = self.reference_time - timedelta(days=days)
        all_events = []
        for code in matching_codes:
            events = self.recurrence.get_events(
                turbine_id=turbine_id,
                alarm_code=code,
                start=start,
                end=self.reference_time,
            )
            all_events.append(events)

        if all_events:
            combined = pd.concat(all_events, ignore_index=True).sort_values("event_timestamp")
        else:
            combined = pd.DataFrame()

        count = len(combined)
        if count == 0:
            answer = f"No alarms from {sensor_type} sensor on {turbine_id} in the last {days} days."
        else:
            lines = [f"Alarms from {sensor_type} sensor on {turbine_id} (last {days} days):"]
            for _, row in combined.iterrows():
                lines.append(f"  {row['event_timestamp']} — {row['alarm_code']} ({row['alarm_description']})")
            answer = "\n".join(lines)

        return QueryResult(
            query_type="sensor_alarms_recent",
            question=f"Show all alarms from {sensor_type} sensor on {turbine_id} in the last {days} days",
            answer=answer,
            data=combined.to_dict("records") if count > 0 else [],
            metadata={"sensor_type": sensor_type, "turbine_id": turbine_id, "days": days, "count": count},
        )

    def highest_recurrence_turbines_sensors(self, n: int = 10) -> QueryResult:
        """'Which turbines and sensors have the highest alarm recurrence?'"""
        # Top by turbine+code
        top = self.recurrence.top_recurring(n, by="total_occurrences")

        lines = [f"Top {len(top)} highest-recurrence alarm groups:"]
        for s in top:
            lines.append(f"  {s.turbine_id} | {s.alarm_code} | {s.total_occurrences} total | 7d: {s.occurrences_7d} | 30d: {s.occurrences_30d}")

        # Cross-turbine summary
        cross = self.recurrence.df.groupby("alarm_code").agg(
            total=("event_id", "count"),
            turbines=("turbine_id", "nunique"),
        ).sort_values("total", ascending=False)

        lines.append("\nCross-turbine summary:")
        for code, row in cross.iterrows():
            lines.append(f"  {code}: {row['total']} total events across {row['turbines']} turbines")

        data = [s.to_dict() for s in top]

        return QueryResult(
            query_type="highest_recurrence",
            question="Which turbines and sensors have the highest alarm recurrence?",
            answer="\n".join(lines),
            data=data,
            metadata={"n": n},
        )

    def recurrence_trends(self, alarm_code: str, turbine_id: str, window_days: int = 30) -> QueryResult:
        """Get recurrence rate trend over time for charting."""
        events = self.recurrence.get_events(
            turbine_id=turbine_id,
            alarm_code=alarm_code,
            start=self.reference_time - timedelta(days=window_days),
            end=self.reference_time,
        )

        if events.empty:
            return QueryResult(
                query_type="recurrence_trend",
                question=f"Recurrence trend for {alarm_code} on {turbine_id}",
                answer="No data available",
                data=[],
                metadata={"alarm_code": alarm_code, "turbine_id": turbine_id, "window_days": window_days},
            )

        # Daily counts
        events_copy = events.copy()
        events_copy["date"] = events_copy["event_timestamp"].dt.date
        daily = events_copy.groupby("date").size().reset_index(name="count")
        daily["date"] = daily["date"].astype(str)

        # Fill missing dates
        all_dates = pd.date_range(
            start=(self.reference_time - timedelta(days=window_days)).date(),
            end=self.reference_time.date(),
            freq="D"
        )
        daily = daily.set_index("date").reindex(all_dates.astype(str), fill_value=0).reset_index()
        daily.columns = ["date", "count"]

        return QueryResult(
            query_type="recurrence_trend",
            question=f"Recurrence trend for {alarm_code} on {turbine_id}",
            answer=f"Daily occurrence counts for last {window_days} days",
            data=daily.to_dict("records"),
            metadata={"alarm_code": alarm_code, "turbine_id": turbine_id, "window_days": window_days},
        )

    # ──────────────────────────────────────────────────────────────────────────
    # Baseline / Alerting Queries
    # ──────────────────────────────────────────────────────────────────────────

    def current_alerts(self, threshold: str = "2x_median") -> QueryResult:
        """Get currently elevated recurrence groups."""
        alerts = self.baseline.get_alerts(threshold)

        if not alerts:
            answer = f"No alarms currently exceed the {threshold} threshold."
            data = []
        else:
            lines = [f"Current alerts ({threshold} threshold):"]
            for a in alerts:
                lines.append(
                    f"  {a.turbine_id} | {a.alarm_code} | "
                    f"7d rate: {a.current_rate_7d:.2f}/day | "
                    f"threshold: {a.alert_threshold_2x_median:.2f}/day | "
                    f"median: {a.median_rate_per_day:.2f}/day"
                )
            answer = "\n".join(lines)
            data = [a.to_dict() for a in alerts]

        return QueryResult(
            query_type="current_alerts",
            question=f"Show current alerts exceeding {threshold}",
            answer=answer,
            data=data,
            metadata={"threshold": threshold},
        )

    def baseline_summary(self) -> QueryResult:
        """Full baseline summary for all groups."""
        stats = self.baseline.compute_baseline()
        data = [s.to_dict() for s in stats]

        elevated = [s for s in stats if s.is_elevated_2x]
        answer = (
            f"Baseline summary ({len(stats)} groups):\n"
            f"  Elevated (2x median): {len(elevated)} groups\n"
            f"  Total events in window: {sum(s.total_events for s in stats)}"
        )

        return QueryResult(
            query_type="baseline_summary",
            question="Show statistical baseline summary",
            answer=answer,
            data=data,
            metadata={"total_groups": len(stats)},
        )

    # ──────────────────────────────────────────────────────────────────────────
    # Enrichment
    # ──────────────────────────────────────────────────────────────────────────

    def enrich_events(self, events: pd.DataFrame) -> pd.DataFrame:
        """Enrich events with turbine/sensor metadata."""
        enriched = []
        for _, row in events.iterrows():
            enriched.append(enrich_alarm_with_mapping(row.to_dict(), self.catalog))
        return pd.DataFrame(enriched)


# ──────────────────────────────────────────────────────────────────────────────
# Natural Language Parser (Simple Pattern Matching)
# ──────────────────────────────────────────────────────────────────────────────

import re

class NaturalLanguageQueryParser:
    """
    Simple pattern-based parser for common question formats.
    Not an LLM — uses regex patterns for deterministic parsing.
    """

    PATTERNS = [
        # "Which alarms recurred most often on WT-003?"
        (r"which alarms? recurred most often on (WT-\d+)", "which_alarms_recurred_most", ["turbine_id"]),
        # "How many times did alarm ALM-104 occur between 2026-10-20 and 2026-10-23?"
        (r"how many times did alarm ([A-Z0-9-]+) occur between (\d{4}-\d{2}-\d{2}) and (\d{4}-\d{2}-\d{2})(?: on (WT-\d+))?", "count_alarm_in_range", ["alarm_code", "start", "end", "turbine_id"]),
        # "Which sensor reported alarm VIB-201 on WT-03?"
        (r"which sensor reported alarm ([A-Z0-9-]+) on (WT-\d+)", "which_sensor_reported", ["alarm_code", "turbine_id"]),
        # "Where is the sensor for alarm VIB-201 on WT-03 located?"
        (r"where is the sensor for alarm ([A-Z0-9-]+) on (WT-\d+) located", "where_is_sensor_located", ["alarm_code", "turbine_id"]),
        # "Show first and most recent occurrence of VIB-201 on WT-03"
        (r"show first and most recent occurrence of ([A-Z0-9-]+)(?: on (WT-\d+))?", "first_and_recent", ["alarm_code", "turbine_id"]),
        # "Compare recurrence of VIB-201 across turbines"
        (r"compare recurrence of ([A-Z0-9-]+) across turbines", "compare_recurrence_across_turbines", ["alarm_code"]),
        # "Show all alarms from vibration sensor on WT-03 in the last 7 days"
        (r"show all alarms from (\w+) sensor on (WT-\d+) in the last (\d+) days", "alarms_from_sensor_last_days", ["sensor_type", "turbine_id", "days"]),
        # "Which turbines have the highest alarm recurrence?"
        (r"which turbines? (?:and sensors?)? have the highest alarm recurrence", "highest_recurrence_turbines_sensors", []),
        # "Show current alerts"
        (r"show current alerts(?: (2x_median|3x_median|p95|p99))?", "current_alerts", ["threshold"]),
    ]

    def __init__(self, engine: AlarmQueryEngine):
        self.engine = engine

    def parse(self, question: str) -> Optional[QueryResult]:
        """Parse a natural language question and execute the query."""
        question = question.strip()

        for pattern, method_name, param_names in self.PATTERNS:
            match = re.search(pattern, question, re.IGNORECASE)
            if match:
                method = getattr(self.engine, method_name)
                kwargs = {}

                for i, param in enumerate(param_names):
                    value = match.group(i + 1)
                    if value is None:
                        continue

                    # Type conversion
                    if param in ("start", "end"):
                        kwargs[param] = datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
                    elif param == "days":
                        kwargs[param] = int(value)
                    elif param == "threshold":
                        kwargs[param] = value or "2x_median"
                    else:
                        kwargs[param] = value

                return method(**kwargs)

        return None


# ──────────────────────────────────────────────────────────────────────────────
# Demo / CLI
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    from pathlib import Path

    sample_path = Path(__file__).parent.parent / "sample_data" / "synthetic_alarms.csv"
    if not sample_path.exists():
        sample_path = Path(__file__).parent.parent / "legacy" / "streamlit" / "sample_data" / "synthetic_alarms.csv"

    if sample_path.exists():
        df = pd.read_csv(sample_path)
        df = df.rename(columns={
            "alarm_id": "event_id",
            "timestamp": "event_timestamp",
            "turbine_id": "turbine_id",
            "alarm_code": "alarm_code",
            "description": "alarm_description",
        })
        df["event_timestamp"] = pd.to_datetime(df["event_timestamp"], utc=True)

        engine = AlarmQueryEngine(df)
        parser = NaturalLanguageQueryParser(engine)

        test_questions = [
            "Which alarms recurred most often on WT-03?",
            "How many times did alarm VIB-201 occur between 2026-10-20 and 2026-10-23 on WT-03?",
            "Which sensor reported alarm VIB-201 on WT-03?",
            "Where is the sensor for alarm VIB-201 on WT-03 located?",
            "Show first and most recent occurrence of VIB-201 on WT-03",
            "Compare recurrence of VIB-201 across turbines",
            "Show all alarms from vibration sensor on WT-03 in the last 7 days",
            "Which turbines have the highest alarm recurrence?",
            "Show current alerts",
        ]

        print("=== Natural Language Query Demo ===\n")
        for q in test_questions:
            result = parser.parse(q)
            if result:
                print(f"Q: {q}")
                print(f"A: {result.answer}\n")
            else:
                print(f"Q: {q}")
                print("A: Could not parse question\n")
    else:
        print("Sample data not found")