#!/usr/bin/env python3
"""
WindSage AI Phase 1 — Alarm Intelligence Demo
Streamlit app for hackathon review (8 PM demo).

Features:
- Loads alarm data from CSV/Parquet
- Recurrence dashboard with filtering
- Sensor/turbine mapping (explicit about missing data)
- Statistical baseline alerts
- CSV export
"""

import sys
from pathlib import Path

import pandas as pd
import streamlit as st

# Add phase1 to path
sys.path.insert(0, str(Path(__file__).parent))

from phase1.recurrence import RecurrenceEngine
from phase1.baseline import StatisticalBaseline, assess_ml_readiness
from phase1.mapping import MappingCatalog, create_default_catalog, enrich_alarm_with_mapping

# ──────────────────────────────────────────────────────────────────────────────
# Page Config
# ──────────────────────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="WindSage AI — Alarm Intelligence",
    page_icon="🌬️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ──────────────────────────────────────────────────────────────────────────────
# Data Loading
# ──────────────────────────────────────────────────────────────────────────────

@st.cache_data
def load_alarm_data() -> pd.DataFrame:
    """Load and normalize alarm data from CSV."""
    csv_path = Path(__file__).parent / "sample_data" / "synthetic_alarms.csv"
    if not csv_path.exists():
        csv_path = Path(__file__).parent / "legacy" / "streamlit" / "sample_data" / "synthetic_alarms.csv"

    if not csv_path.exists():
        st.error(f"Data file not found at {csv_path}")
        st.stop()

    df = pd.read_csv(csv_path)
    # Normalize column names
    df = df.rename(columns={
        "alarm_id": "event_id",
        "timestamp": "event_timestamp",
        "turbine_id": "turbine_id",
        "alarm_code": "alarm_code",
        "description": "alarm_description",
    })
    df["event_timestamp"] = pd.to_datetime(df["event_timestamp"], utc=True)
    return df


@st.cache_resource
def get_catalog() -> MappingCatalog:
    """Get the default mapping catalog."""
    return create_default_catalog()


# ──────────────────────────────────────────────────────────────────────────────
# Sidebar — Filters
# ──────────────────────────────────────────────────────────────────────────────

def sidebar_filters(df: pd.DataFrame) -> dict:
    """Render sidebar filters and return filter dict."""
    st.sidebar.header("🔍 Filters")

    # Turbine filter
    turbines = sorted(df["turbine_id"].unique())
    selected_turbines = st.sidebar.multiselect("Turbines", turbines, default=turbines)

    # Alarm code filter
    alarm_codes = sorted(df["alarm_code"].unique())
    selected_codes = st.sidebar.multiselect("Alarm Codes", alarm_codes, default=alarm_codes)

    # Severity filter
    severities = sorted(df["severity"].unique())
    selected_severities = st.sidebar.multiselect("Severity", severities, default=severities)

    # Status filter
    statuses = sorted(df["status"].unique())
    selected_statuses = st.sidebar.multiselect("Status", statuses, default=statuses)

    # Date range
    min_date = df["event_timestamp"].min().date()
    max_date = df["event_timestamp"].max().date()
    date_range = st.sidebar.date_input(
        "Date Range",
        value=(min_date, max_date),
        min_value=min_date,
        max_value=max_date,
    )

    # Reference time (for "last 24h/7d/30d" calculations)
    ref_time = st.sidebar.datetime_input(
        "Reference Time (UTC)",
        value=pd.Timestamp.now(tz="UTC").to_pydatetime(),
        help="Used for recurrence window calculations",
    )

    return {
        "turbines": selected_turbines,
        "alarm_codes": selected_codes,
        "severities": selected_severities,
        "statuses": selected_statuses,
        "date_range": date_range,
        "reference_time": pd.Timestamp(ref_time).tz_localize("UTC") if ref_time.tzinfo is None else pd.Timestamp(ref_time),
    }


def apply_filters(df: pd.DataFrame, filters: dict) -> pd.DataFrame:
    """Apply filters to dataframe."""
    filtered = df.copy()
    if filters["turbines"]:
        filtered = filtered[filtered["turbine_id"].isin(filters["turbines"])]
    if filters["alarm_codes"]:
        filtered = filtered[filtered["alarm_code"].isin(filters["alarm_codes"])]
    if filters["severities"]:
        filtered = filtered[filtered["severity"].isin(filters["severities"])]
    if filters["statuses"]:
        filtered = filtered[filtered["status"].isin(filters["statuses"])]
    if len(filters["date_range"]) == 2:
        start, end = filters["date_range"]
        filtered = filtered[
            (filtered["event_timestamp"].dt.date >= start) &
            (filtered["event_timestamp"].dt.date <= end)
        ]
    return filtered


# ──────────────────────────────────────────────────────────────────────────────
# Dashboard Components
# ──────────────────────────────────────────────────────────────────────────────

def render_overview_metrics(df: pd.DataFrame, engine: RecurrenceEngine):
    """Render top-level metrics."""
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric("Total Alarm Events", len(df))
    with col2:
        st.metric("Unique Turbines", df["turbine_id"].nunique())
    with col3:
        st.metric("Unique Alarm Codes", df["alarm_code"].nunique())
    with col4:
        # Most frequent alarm
        top = engine.top_recurring(1)
        if top:
            st.metric("Top Recurring", f"{top[0].alarm_code} ({top[0].total_occurrences})")
        else:
            st.metric("Top Recurring", "—")


def render_recurrence_table(engine: RecurrenceEngine, filters: dict):
    """Render recurrence statistics table."""
    st.subheader("📊 Recurrence by Turbine & Alarm Code")

    stats_df = engine.compute_dataframe()

    # Apply turbine/alarm filters to stats
    if filters["turbines"]:
        stats_df = stats_df[stats_df["turbine_id"].isin(filters["turbines"])]
    if filters["alarm_codes"]:
        stats_df = stats_df[stats_df["alarm_code"].isin(filters["alarm_codes"])]

    if stats_df.empty:
        st.info("No recurrence data matches current filters.")
        return

    # Select display columns
    display_cols = [
        "turbine_id", "alarm_code", "alarm_description",
        "total_occurrences", "first_occurrence", "last_occurrence",
        "occurrences_24h", "occurrences_7d", "occurrences_30d",
        "mean_interval_h", "burst_flag",
    ]
    stats_display = stats_df[display_cols].copy()
    stats_display = stats_display.sort_values("total_occurrences", ascending=False)

    # Format timestamps
    for col in ["first_occurrence", "last_occurrence"]:
        if col in stats_display.columns:
            stats_display[col] = pd.to_datetime(stats_display[col]).dt.strftime("%Y-%m-%d %H:%M UTC")

    st.dataframe(stats_display, use_container_width=True, hide_index=True)

    # CSV Export
    csv = stats_display.to_csv(index=False).encode("utf-8")
    st.download_button(
        "📥 Export Recurrence Table (CSV)",
        csv,
        file_name="windsage_recurrence.csv",
        mime="text/csv",
    )


def render_alarm_history(df: pd.DataFrame, catalog: MappingCatalog, filters: dict):
    """Render filtered alarm history with sensor/turbine enrichment."""
    st.subheader("📋 Alarm History (Filtered)")

    # Enrich with mapping
    enriched = enrich_alarm_with_mapping(df.to_dict("records"), catalog)
    enriched_df = pd.DataFrame(enriched)

    # Select display columns
    display_cols = [
        "event_id", "event_timestamp", "turbine_id", "turbine_site",
        "alarm_code", "alarm_description", "severity", "duration_min", "status",
        "reporting_sensor_type", "reporting_sensor_location", "alarm_sensor_notes",
    ]
    # Only show columns that exist
    display_cols = [c for c in display_cols if c in enriched_df.columns]

    display_df = enriched_df[display_cols].copy()
    display_df = display_df.sort_values("event_timestamp", ascending=False)

    # Format timestamp
    if "event_timestamp" in display_df.columns:
        display_df["event_timestamp"] = pd.to_datetime(display_df["event_timestamp"]).dt.strftime("%Y-%m-%d %H:%M UTC")

    st.dataframe(display_df, use_container_width=True, hide_index=True)

    # CSV Export
    csv = display_df.to_csv(index=False).encode("utf-8")
    st.download_button(
        "📥 Export Alarm History (CSV)",
        csv,
        file_name="windsage_alarm_history.csv",
        mime="text/csv",
    )


def render_baseline_alerts(df: pd.DataFrame, reference_time: pd.Timestamp):
    """Render statistical baseline alerts."""
    st.subheader("🚨 Statistical Baseline Alerts")

    baseline = StatisticalBaseline(df, reference_time=reference_time.to_pydatetime())
    assessment = assess_ml_readiness(df)

    # ML Readiness Banner
    if assessment["ml_ready"]:
        st.success(f"✅ ML Ready: {assessment['recommendation']}")
    else:
        st.warning(f"⚠️ {assessment['recommendation']}")

    alerts = baseline.get_alerts("2x_median")

    if not alerts:
        st.info("No alarms currently exceed the 2× median threshold.")
    else:
        alert_data = []
        for a in alerts:
            alert_data.append({
                "Turbine": a.turbine_id,
                "Alarm Code": a.alarm_code,
                "Description": a.alarm_description,
                "7-day Rate (events/day)": f"{a.current_rate_7d:.2f}",
                "Median Rate (events/day)": f"{a.median_rate_per_day:.2f}",
                "2× Median Threshold": f"{a.alert_threshold_2x_median:.2f}",
                "Elevated 3×": "🔴" if a.is_elevated_3x else "🟢",
                "Elevated P95": "🔴" if a.is_elevated_p95 else "🟢",
            })
        alert_df = pd.DataFrame(alert_data)
        st.dataframe(alert_df, use_container_width=True, hide_index=True)

        # Show baseline summary table
        with st.expander("📈 Full Baseline Summary"):
            baseline_df = baseline.compute_dataframe()
            st.dataframe(baseline_df, use_container_width=True, hide_index=True)


def render_cross_turbine_comparison(engine: RecurrenceEngine):
    """Render cross-turbine comparison for selected alarm code."""
    st.subheader("🔄 Cross-Turbine Comparison")

    alarm_codes = sorted(engine.df["alarm_code"].unique())
    selected_code = st.selectbox("Select Alarm Code", alarm_codes)

    comparison = engine.compare_turbines(selected_code)
    if comparison.empty:
        st.info(f"No data for {selected_code}")
    else:
        st.dataframe(comparison, use_container_width=True, hide_index=True)


def render_recurrence_trend(engine: RecurrenceEngine, reference_time: pd.Timestamp):
    """Render recurrence trend chart."""
    st.subheader("📈 Recurrence Trend")

    col1, col2, col3 = st.columns(3)
    with col1:
        alarm_codes = sorted(engine.df["alarm_code"].unique())
        selected_code = st.selectbox("Alarm Code", alarm_codes, key="trend_code")
    with col2:
        turbines = sorted(engine.df["turbine_id"].unique())
        selected_turbine = st.selectbox("Turbine", turbines, key="trend_turbine")
    with col3:
        window = st.selectbox("Window (days)", [7, 14, 30, 60], index=2, key="trend_window")

    events = engine.get_events(
        turbine_id=selected_turbine,
        alarm_code=selected_code,
        start=reference_time - pd.Timedelta(days=window),
        end=reference_time,
    )

    if events.empty:
        st.info(f"No events for {selected_code} on {selected_turbine} in the last {window} days.")
        return

    # Daily counts
    events = events.copy()
    events["date"] = events["event_timestamp"].dt.date
    daily = events.groupby("date").size().reset_index(name="count")
    daily["date"] = pd.to_datetime(daily["date"])

    # Fill missing dates
    all_dates = pd.date_range(
        start=(reference_time - pd.Timedelta(days=window)).date(),
        end=reference_time.date(),
        freq="D",
    )
    daily = daily.set_index("date").reindex(all_dates, fill_value=0).reset_index()
    daily.columns = ["date", "count"]

    # Chart
    st.line_chart(daily.set_index("date")["count"])


# ──────────────────────────────────────────────────────────────────────────────
# Main App
# ──────────────────────────────────────────────────────────────────────────────

def main():
    st.title("🌬️ WindSage AI — Alarm Intelligence Bot")
    st.caption("Phase 1: Alarm Recurrence & Sensor Intelligence • Synthetic Demo Data • Advisory Only")

    # Load data
    df = load_alarm_data()
    catalog = get_catalog()

    # Sidebar filters
    filters = sidebar_filters(df)

    # Apply filters
    filtered_df = apply_filters(df, filters)

    # Initialize engines with filtered data and reference time
    ref_time = filters["reference_time"]
    engine = RecurrenceEngine(filtered_df, reference_time=ref_time.to_pydatetime())
    baseline = StatisticalBaseline(filtered_df, reference_time=ref_time.to_pydatetime())

    # Tabs
    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "📊 Overview",
        "📋 Alarm History",
        "📈 Trends",
        "🚨 Alerts",
        "🤖 ML Status",
    ])

    with tab1:
        render_overview_metrics(filtered_df, engine)
        st.divider()
        render_recurrence_table(engine, filters)
        st.divider()
        render_cross_turbine_comparison(engine)

    with tab2:
        render_alarm_history(filtered_df, catalog, filters)

    with tab3:
        render_recurrence_trend(engine, ref_time)

    with tab4:
        render_baseline_alerts(filtered_df, ref_time)

    with tab5:
        st.subheader("🤖 ML Model Status")
        assessment = assess_ml_readiness(filtered_df)

        col1, col2 = st.columns(2)
        with col1:
            st.json({
                "ml_ready": assessment["ml_ready"],
                "date_range_days": assessment["date_range_days"],
                "total_events": assessment["total_events"],
                "n_turbines": assessment["n_turbines"],
                "n_alarm_codes": assessment["n_alarm_codes"],
            })
        with col2:
            st.json({
                "min_days_required": assessment["min_days_required"],
                "min_events_per_code_required": assessment["min_events_per_code_required"],
                "min_turbines_required": assessment["min_turbines_required"],
                "codes_with_sufficient_events": assessment["codes_with_sufficient_events"],
            })

        st.markdown("**Recommendation:**")
        if assessment["ml_ready"]:
            st.success(assessment["recommendation"])
        else:
            st.warning(assessment["recommendation"])

        st.markdown("---")
        st.markdown("**Events per Alarm Code:**")
        st.json(assessment["events_per_alarm_code"])


if __name__ == "__main__":
    main()