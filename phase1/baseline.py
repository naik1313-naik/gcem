#!/usr/bin/env python3
"""
WindSage AI Phase 1 — Statistical Baseline & Anomaly Detection

Provides deterministic statistical baselines for alarm recurrence.
Does NOT use ML models when data is insufficient (current state).
Implements rolling-window statistics, threshold-based alerting, and burst detection.

When sufficient data exists (≥90 days, ≥50 events per code), can optionally fit
an Isolation Forest for unsupervised anomaly detection on recurrence rates.
"""

from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd

try:
    from sklearn.ensemble import IsolationForest
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    IsolationForest = None


@dataclass
class BaselineStats:
    """Statistical baseline for a (turbine_id, alarm_code) group."""
    turbine_id: str
    alarm_code: str
    alarm_description: str
    window_days: int
    total_events: int
    mean_rate_per_day: float
    median_rate_per_day: float
    std_rate_per_day: float
    min_rate_per_day: float
    max_rate_per_day: float
    percentile_95_rate: float
    percentile_99_rate: float
    current_rate_7d: float
    current_rate_30d: float
    alert_threshold_2x_median: float
    alert_threshold_3x_median: float
    alert_threshold_p95: float
    alert_threshold_p99: float
    is_elevated_2x: bool
    is_elevated_3x: bool
    is_elevated_p95: bool
    is_elevated_p99: bool
    burst_flag: bool = False
    anomaly_score: Optional[float] = None
    is_anomaly_ml: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ModelMetadata:
    """Metadata for a fitted anomaly detection model."""
    model_type: str
    trained_at: str
    training_window_days: int
    n_training_samples: int
    n_features: int
    feature_names: list[str]
    contamination: float
    random_state: int
    sklearn_version: Optional[str] = None
    notes: str = ""


class StatisticalBaseline:
    """
    Compute rolling-window recurrence rates and threshold-based alerts.

    For each (turbine, alarm_code), computes daily event rates over a historical
    window and compares recent rates against thresholds.
    """

    def __init__(
        self,
        df: pd.DataFrame,
        turbine_col: str = "turbine_id",
        code_col: str = "alarm_code",
        timestamp_col: str = "event_timestamp",
        description_col: str = "alarm_description",
        reference_time: Optional[datetime] = None,
        baseline_window_days: int = 30,
    ):
        """
        Args:
            df: Normalized alarm events DataFrame
            turbine_col: Turbine ID column
            code_col: Alarm code column
            timestamp_col: Event timestamp column (timezone-aware)
            description_col: Alarm description column
            reference_time: Reference "now" (default: UTC now)
            baseline_window_days: Historical window for baseline calculation
        """
        self.df = df.copy()
        self.turbine_col = turbine_col
        self.code_col = code_col
        self.timestamp_col = timestamp_col
        self.description_col = description_col
        self.reference_time = reference_time or datetime.now(timezone.utc)
        self.baseline_window_days = baseline_window_days

        # Validate
        for col in [turbine_col, code_col, timestamp_col, description_col]:
            if col not in self.df.columns:
                raise ValueError(f"Required column not found: {col}")

        # Ensure timestamp is UTC
        if not pd.api.types.is_datetime64tz_dtype(self.df[timestamp_col]):
            self.df[timestamp_col] = pd.to_datetime(self.df[timestamp_col], utc=True)
        elif self.df[timestamp_col].dt.tz != timezone.utc:
            self.df[timestamp_col] = self.df[timestamp_col].dt.tz_convert(timezone.utc)

    def _daily_rates(self, group: pd.DataFrame) -> pd.Series:
        """Compute daily event counts for a group."""
        timestamps = group[self.timestamp_col].dt.tz_convert(None)  # Remove tz for date ops
        if len(timestamps) == 0:
            return pd.Series(dtype=float)

        start_date = timestamps.min().date()
        end_date = self.reference_time.date()
        all_dates = pd.date_range(start_date, end_date, freq="D")
        daily_counts = timestamps.dt.date.value_counts().reindex(all_dates.date, fill_value=0)
        return daily_counts

    def compute_baseline(self) -> list[BaselineStats]:
        """Compute baseline stats for all (turbine, alarm_code) groups."""
        results = []

        cutoff = self.reference_time - timedelta(days=self.baseline_window_days)
        df_baseline = self.df[self.df[self.timestamp_col] >= cutoff]

        for (turbine, code), group in df_baseline.groupby([self.turbine_col, self.code_col]):
            description = group[self.description_col].iloc[0]
            daily_rates = self._daily_rates(group)

            if len(daily_rates) == 0:
                continue

            total_events = int(daily_rates.sum())
            mean_rate = float(daily_rates.mean())
            median_rate = float(daily_rates.median())
            std_rate = float(daily_rates.std()) if len(daily_rates) > 1 else 0.0
            min_rate = float(daily_rates.min())
            max_rate = float(daily_rates.max())
            p95 = float(daily_rates.quantile(0.95))
            p99 = float(daily_rates.quantile(0.99))

            # Current rates (last 7 and 30 days)
            now = self.reference_time
            recent_7d = group[group[self.timestamp_col] >= (now - timedelta(days=7))]
            recent_30d = group[group[self.timestamp_col] >= (now - timedelta(days=30))]
            current_7d = len(recent_7d) / 7.0
            current_30d = len(recent_30d) / 30.0

            # Thresholds
            threshold_2x = 2 * median_rate if median_rate > 0 else 1.0
            threshold_3x = 3 * median_rate if median_rate > 0 else 1.0
            threshold_p95 = p95
            threshold_p99 = p99

            # Burst detection: >=3 events within 48h rolling window
            burst_flag = False
            if total_events >= 3:
                timestamps = group[self.timestamp_col].sort_values()
                for i in range(len(timestamps) - 2):
                    window_start = timestamps.iloc[i]
                    window_end = window_start + timedelta(hours=48)
                    window_count = int(((timestamps >= window_start) & (timestamps <= window_end)).sum())
                    if window_count >= 3:
                        burst_flag = True
                        break

            # Alert flags
            is_elevated_2x = current_7d > threshold_2x
            is_elevated_3x = current_7d > threshold_3x
            is_elevated_p95 = current_7d > threshold_p95
            is_elevated_p99 = current_7d > threshold_p99

            results.append(BaselineStats(
                turbine_id=turbine,
                alarm_code=code,
                alarm_description=description,
                window_days=self.baseline_window_days,
                total_events=total_events,
                mean_rate_per_day=mean_rate,
                median_rate_per_day=median_rate,
                std_rate_per_day=std_rate,
                min_rate_per_day=min_rate,
                max_rate_per_day=max_rate,
                percentile_95_rate=p95,
                percentile_99_rate=p99,
                current_rate_7d=current_7d,
                current_rate_30d=current_30d,
                alert_threshold_2x_median=threshold_2x,
                alert_threshold_3x_median=threshold_3x,
                alert_threshold_p95=threshold_p95,
                alert_threshold_p99=threshold_p99,
                is_elevated_2x=is_elevated_2x,
                is_elevated_3x=is_elevated_3x,
                is_elevated_p95=is_elevated_p95,
                is_elevated_p99=is_elevated_p99,
                burst_flag=burst_flag,
            ))

        return results

    def compute_dataframe(self) -> pd.DataFrame:
        return pd.DataFrame([b.to_dict() for b in self.compute_baseline()])

    def get_alerts(self, threshold: str = "2x_median") -> list[BaselineStats]:
        """Get all groups currently exceeding a threshold."""
        baselines = self.compute_baseline()
        flag_col = f"is_elevated_{threshold.replace('.', '_').replace('x', 'x')}"
        if threshold == "2x_median":
            flag_col = "is_elevated_2x"
        elif threshold == "3x_median":
            flag_col = "is_elevated_3x"
        elif threshold == "p95":
            flag_col = "is_elevated_p95"
        elif threshold == "p99":
            flag_col = "is_elevated_p99"

        return [b for b in baselines if getattr(b, flag_col, False)]


class AnomalyDetector:
    """
    Optional ML-based anomaly detection for recurrence patterns.
    Only use when sufficient data exists (documented here, not auto-enabled).
    """

    def __init__(
        self,
        contamination: float = 0.05,
        random_state: int = 42,
        n_estimators: int = 200,
    ):
        if not SKLEARN_AVAILABLE:
            raise RuntimeError("scikit-learn not available. Install with: pip install scikit-learn")

        self.contamination = contamination
        self.random_state = random_state
        self.n_estimators = n_estimators
        self.model: Optional[IsolationForest] = None
        self.feature_names: list[str] = []
        self.metadata: Optional[ModelMetadata] = None

    def _prepare_features(self, baselines: list[BaselineStats]) -> np.ndarray:
        """Convert baselines to feature matrix for ML."""
        features = []
        for b in baselines:
            features.append([
                b.total_events,
                b.mean_rate_per_day,
                b.median_rate_per_day,
                b.std_rate_per_day,
                b.current_rate_7d,
                b.current_rate_30d,
                b.current_rate_7d / max(b.median_rate_per_day, 0.001),  # rate ratio
                b.percentile_95_rate,
                b.percentile_99_rate,
                1.0 if b.is_elevated_2x else 0.0,
                1.0 if b.burst_flag else 0.0,  # Need to add burst_flag to BaselineStats
            ])
        return np.array(features)

    def fit(self, baselines: list[BaselineStats]) -> ModelMetadata:
        """Fit Isolation Forest on baseline statistics."""
        X = self._prepare_features(baselines)
        self.feature_names = [
            "total_events", "mean_rate", "median_rate", "std_rate",
            "current_rate_7d", "current_rate_30d", "rate_ratio",
            "p95_rate", "p99_rate", "elevated_2x_flag", "burst_flag"
        ]

        self.model = IsolationForest(
            n_estimators=self.n_estimators,
            contamination=self.contamination,
            random_state=self.random_state,
            n_jobs=-1,
        )
        self.model.fit(X)

        # Score training data
        scores = self.model.decision_function(X)
        predictions = self.model.predict(X)  # -1 = anomaly, 1 = normal

        self.metadata = ModelMetadata(
            model_type="IsolationForest",
            trained_at=datetime.now(timezone.utc).isoformat(),
            training_window_days=baselines[0].window_days if baselines else 0,
            n_training_samples=len(baselines),
            n_features=X.shape[1],
            feature_names=self.feature_names,
            contamination=self.contamination,
            random_state=self.random_state,
            notes="Unsupervised anomaly detection on recurrence rate features. "
                  "No ground-truth labels available — treat as exploratory.",
        )

        return self.metadata

    def predict(self, baselines: list[BaselineStats]) -> list[BaselineStats]:
        """Predict anomalies for new baselines."""
        if self.model is None:
            raise RuntimeError("Model not fitted. Call fit() first.")

        X = self._prepare_features(baselines)
        scores = self.model.decision_function(X)
        predictions = self.model.predict(X)

        results = []
        for b, score, pred in zip(baselines, scores, predictions):
            b.anomaly_score = float(score)
            b.is_anomaly_ml = (pred == -1)
            results.append(b)

        return results

    def save(self, model_path: Path, metadata_path: Optional[Path] = None) -> None:
        """Save model and metadata."""
        if self.model is None:
            raise RuntimeError("No model to save")
        joblib.dump(self.model, model_path)
        if metadata_path and self.metadata:
            import json
            metadata_path.write_text(json.dumps(asdict(self.metadata), indent=2))

    @classmethod
    def load(cls, model_path: Path, metadata_path: Optional[Path] = None) -> "AnomalyDetector":
        """Load model and metadata."""
        detector = cls()
        detector.model = joblib.load(model_path)
        if metadata_path and metadata_path.exists():
            import json
            detector.metadata = ModelMetadata(**json.loads(metadata_path.read_text()))
            detector.feature_names = detector.metadata.feature_names
        return detector


# ──────────────────────────────────────────────────────────────────────────────
# Assessment: Is ML Justified?
# ──────────────────────────────────────────────────────────────────────────────

def assess_ml_readiness(
    df: pd.DataFrame,
    timestamp_col: str = "event_timestamp",
    min_days: int = 90,
    min_events_per_code: int = 50,
    min_turbines: int = 5,
) -> dict:
    """
    Assess whether the dataset supports ML-based anomaly detection.

    Returns a dict with assessment results and recommendations.
    """
    # Ensure timestamp
    if not pd.api.types.is_datetime64tz_dtype(df[timestamp_col]):
        ts = pd.to_datetime(df[timestamp_col], utc=True)
    else:
        ts = df[timestamp_col]

    date_range = (ts.max() - ts.min()).days
    total_events = len(df)
    n_turbines = df["turbine_id"].nunique() if "turbine_id" in df.columns else 0
    n_alarm_codes = df["alarm_code"].nunique() if "alarm_code" in df.columns else 0

    # Events per alarm code
    events_per_code = df.groupby("alarm_code").size() if "alarm_code" in df.columns else pd.Series()
    codes_with_enough = (events_per_code >= min_events_per_code).sum()

    ready = (
        date_range >= min_days and
        codes_with_enough >= 1 and
        n_turbines >= min_turbines and
        total_events >= min_events_per_code * 2
    )

    return {
        "ml_ready": ready,
        "date_range_days": date_range,
        "total_events": int(total_events),
        "n_turbines": int(n_turbines),
        "n_alarm_codes": int(n_alarm_codes),
        "events_per_alarm_code": events_per_code.to_dict(),
        "codes_with_sufficient_events": int(codes_with_enough),
        "min_days_required": min_days,
        "min_events_per_code_required": min_events_per_code,
        "min_turbines_required": min_turbines,
        "recommendation": (
            "Sufficient data for ML anomaly detection"
            if ready
            else f"Insufficient data. Need {min_days}+ days, {min_events_per_code}+ events per code, {min_turbines}+ turbines. "
                 f"Currently: {date_range} days, {codes_with_enough} codes with enough events, {n_turbines} turbines. "
                 "Use statistical baselines instead."
        ),
    }


if __name__ == "__main__":
    from pathlib import Path

    # Load sample data
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

        print("=== ML Readiness Assessment ===")
        assessment = assess_ml_readiness(df)
        for k, v in assessment.items():
            print(f"  {k}: {v}")

        print("\n=== Statistical Baseline (30-day window) ===")
        baseline = StatisticalBaseline(df, baseline_window_days=30)
        stats_df = baseline.compute_dataframe()
        print(stats_df[["turbine_id", "alarm_code", "total_events", "median_rate_per_day",
                        "current_rate_7d", "alert_threshold_2x_median", "is_elevated_2x"]].to_string(index=False))

        print("\n=== Alerts (2x median) ===")
        alerts = baseline.get_alerts("2x_median")
        if alerts:
            for a in alerts:
                print(f"  ALERT: {a.turbine_id} {a.alarm_code} — 7d rate {a.current_rate_7d:.2f}/day > {a.alert_threshold_2x_median:.2f}/day")
        else:
            print("  No alerts")
    else:
        print("Sample data not found")