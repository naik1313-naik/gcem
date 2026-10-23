#!/usr/bin/env python3
"""
WindSage AI Phase 1 — Sensor & Turbine Mapping Module

Provides a mapping layer for:
- turbine ID, name, site, model, capacity
- sensor ID, type, physical location, unit
- alarm code to sensor relationship

When sensor metadata is not available, returns explicit "Unknown — not available in dataset" messages.
Does NOT infer physical locations from correlations.
"""

from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Optional

import pandas as pd


@dataclass
class TurbineInfo:
    """Turbine metadata."""
    turbine_id: str
    name: str
    site: Optional[str] = None
    model: Optional[str] = None
    capacity_kw: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    commissioning_date: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class SensorInfo:
    """Sensor metadata."""
    sensor_id: str
    turbine_id: str
    sensor_type: str  # 'vibration', 'temperature', 'pressure', 'power', 'other'
    location: Optional[str] = None  # e.g., 'gearbox_drive_end', 'main_bearing', 'hydraulic_accumulator'
    unit: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    installation_date: Optional[str] = None
    measurement_range_min: Optional[float] = None
    measurement_range_max: Optional[float] = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AlarmSensorMapping:
    """Maps an alarm code to the sensor(s) that reported it."""
    alarm_code: str
    alarm_description: str
    primary_sensor_type: str
    primary_sensor_id: Optional[str] = None
    primary_sensor_location: Optional[str] = None
    secondary_sensor_types: list = field(default_factory=list)
    notes: str = ""


UNKNOWN_SENSOR_MSG = "Unknown — not available in dataset"
UNKNOWN_LOCATION_MSG = "Unknown — not available in dataset"
UNKNOWN_TURBINE_MSG = "Unknown — not available in dataset"


class MappingCatalog:
    """
    Central catalog for turbine and sensor metadata.
    Loads from CSV/Parquet files or can be populated programmatically.
    """

    def __init__(self):
        self.turbines: dict[str, TurbineInfo] = {}
        self.sensors: dict[str, SensorInfo] = {}  # key: sensor_id
        self.sensors_by_turbine: dict[str, list[str]] = {}  # turbine_id -> [sensor_ids]
        self.alarm_mappings: dict[str, AlarmSensorMapping] = {}

    # ──────────────────────────────────────────────────────────────────────────
    # Turbine Management
    # ──────────────────────────────────────────────────────────────────────────

    def add_turbine(self, turbine: TurbineInfo) -> None:
        self.turbines[turbine.turbine_id] = turbine

    def get_turbine(self, turbine_id: str) -> Optional[TurbineInfo]:
        return self.turbines.get(turbine_id)

    def get_turbine_site(self, turbine_id: str) -> str:
        t = self.turbines.get(turbine_id)
        return t.site if t and t.site else UNKNOWN_TURBINE_MSG

    def get_turbine_name(self, turbine_id: str) -> str:
        t = self.turbines.get(turbine_id)
        return t.name if t else turbine_id

    def list_turbines(self) -> list[TurbineInfo]:
        return list(self.turbines.values())

    def load_turbines_csv(self, path: Path) -> int:
        """Load turbines from CSV with columns: id,name,site,model,capacity_kw,latitude,longitude,commissioning_date"""
        df = pd.read_csv(path)
        required = {"id", "name"}
        if not required.issubset(df.columns):
            raise ValueError(f"Turbine CSV missing required columns: {required - set(df.columns)}")

        count = 0
        for _, row in df.iterrows():
            self.add_turbine(TurbineInfo(
                turbine_id=str(row["id"]),
                name=str(row["name"]),
                site=str(row["site"]) if "site" in df.columns and pd.notna(row.get("site")) else None,
                model=str(row["model"]) if "model" in df.columns and pd.notna(row.get("model")) else None,
                capacity_kw=int(row["capacity_kw"]) if "capacity_kw" in df.columns and pd.notna(row.get("capacity_kw")) else None,
                latitude=float(row["latitude"]) if "latitude" in df.columns and pd.notna(row.get("latitude")) else None,
                longitude=float(row["longitude"]) if "longitude" in df.columns and pd.notna(row.get("longitude")) else None,
                commissioning_date=str(row["commissioning_date"]) if "commissioning_date" in df.columns and pd.notna(row.get("commissioning_date")) else None,
            ))
            count += 1
        return count

    # ──────────────────────────────────────────────────────────────────────────
    # Sensor Management
    # ──────────────────────────────────────────────────────────────────────────

    def add_sensor(self, sensor: SensorInfo) -> None:
        self.sensors[sensor.sensor_id] = sensor
        if sensor.turbine_id not in self.sensors_by_turbine:
            self.sensors_by_turbine[sensor.turbine_id] = []
        if sensor.sensor_id not in self.sensors_by_turbine[sensor.turbine_id]:
            self.sensors_by_turbine[sensor.turbine_id].append(sensor.sensor_id)

    def get_sensor(self, sensor_id: str) -> Optional[SensorInfo]:
        return self.sensors.get(sensor_id)

    def get_sensors_for_turbine(self, turbine_id: str) -> list[SensorInfo]:
        sensor_ids = self.sensors_by_turbine.get(turbine_id, [])
        return [self.sensors[sid] for sid in sensor_ids if sid in self.sensors]

    def get_sensor_by_type_and_turbine(self, turbine_id: str, sensor_type: str) -> list[SensorInfo]:
        """Find sensors of a specific type on a turbine."""
        return [
            s for s in self.get_sensors_for_turbine(turbine_id)
            if s.sensor_type == sensor_type
        ]

    def load_sensors_csv(self, path: Path) -> int:
        """Load sensors from CSV with columns: sensor_id,turbine_id,sensor_type,location,unit,manufacturer,model,installation_date,measurement_range_min,measurement_range_max"""
        df = pd.read_csv(path)
        required = {"sensor_id", "turbine_id", "sensor_type"}
        if not required.issubset(df.columns):
            raise ValueError(f"Sensor CSV missing required columns: {required - set(df.columns)}")

        count = 0
        for _, row in df.iterrows():
            self.add_sensor(SensorInfo(
                sensor_id=str(row["sensor_id"]),
                turbine_id=str(row["turbine_id"]),
                sensor_type=str(row["sensor_type"]),
                location=str(row["location"]) if "location" in df.columns and pd.notna(row.get("location")) else None,
                unit=str(row["unit"]) if "unit" in df.columns and pd.notna(row.get("unit")) else None,
                manufacturer=str(row["manufacturer"]) if "manufacturer" in df.columns and pd.notna(row.get("manufacturer")) else None,
                model=str(row["model"]) if "model" in df.columns and pd.notna(row.get("model")) else None,
                installation_date=str(row["installation_date"]) if "installation_date" in df.columns and pd.notna(row.get("installation_date")) else None,
                measurement_range_min=float(row["measurement_range_min"]) if "measurement_range_min" in df.columns and pd.notna(row.get("measurement_range_min")) else None,
                measurement_range_max=float(row["measurement_range_max"]) if "measurement_range_max" in df.columns and pd.notna(row.get("measurement_range_max")) else None,
            ))
            count += 1
        return count

    # ──────────────────────────────────────────────────────────────────────────
    # Alarm-to-Sensor Mapping
    # ──────────────────────────────────────────────────────────────────────────

    def add_alarm_mapping(self, mapping: AlarmSensorMapping) -> None:
        self.alarm_mappings[mapping.alarm_code] = mapping

    def get_alarm_mapping(self, alarm_code: str) -> AlarmSensorMapping:
        """Get sensor mapping for an alarm code. Returns explicit unknown if not found."""
        if alarm_code in self.alarm_mappings:
            return self.alarm_mappings[alarm_code]

        # Return explicit unknown mapping
        return AlarmSensorMapping(
            alarm_code=alarm_code,
            alarm_description="",
            primary_sensor_type="unknown",
            primary_sensor_id=None,
            primary_sensor_location=None,
            notes="No alarm-sensor mapping defined in catalog",
        )

    def get_sensor_for_alarm(self, alarm_code: str, turbine_id: str) -> tuple[str, str, str]:
        """
        Get (sensor_id, sensor_type, sensor_location) for an alarm on a specific turbine.
        Returns explicit unknown messages if not available.
        """
        mapping = self.get_alarm_mapping(alarm_code)

        if mapping.primary_sensor_id:
            sensor = self.get_sensor(mapping.primary_sensor_id)
            if sensor and sensor.turbine_id == turbine_id:
                return (
                    sensor.sensor_id,
                    sensor.sensor_type,
                    sensor.location or UNKNOWN_LOCATION_MSG
                )

        # Try to find any sensor of the primary type on this turbine
        sensors = self.get_sensor_by_type_and_turbine(turbine_id, mapping.primary_sensor_type)
        if sensors:
            s = sensors[0]
            return (s.sensor_id, s.sensor_type, s.location or UNKNOWN_LOCATION_MSG)

        return (UNKNOWN_SENSOR_MSG, UNKNOWN_SENSOR_MSG, UNKNOWN_LOCATION_MSG)

    def load_alarm_mappings_csv(self, path: Path) -> int:
        """Load alarm-sensor mappings from CSV."""
        df = pd.read_csv(path)
        required = {"alarm_code", "alarm_description", "primary_sensor_type"}
        if not required.issubset(df.columns):
            raise ValueError(f"Alarm mapping CSV missing required columns: {required - set(df.columns)}")

        count = 0
        for _, row in df.iterrows():
            secondary = []
            if "secondary_sensor_types" in df.columns and pd.notna(row.get("secondary_sensor_types")):
                secondary = [s.strip() for s in str(row["secondary_sensor_types"]).split(";")]

            self.add_alarm_mapping(AlarmSensorMapping(
                alarm_code=str(row["alarm_code"]),
                alarm_description=str(row["alarm_description"]),
                primary_sensor_type=str(row["primary_sensor_type"]),
                primary_sensor_id=str(row["primary_sensor_id"]) if "primary_sensor_id" in df.columns and pd.notna(row.get("primary_sensor_id")) else None,
                primary_sensor_location=str(row["primary_sensor_location"]) if "primary_sensor_location" in df.columns and pd.notna(row.get("primary_sensor_location")) else None,
                secondary_sensor_types=secondary,
                notes=str(row["notes"]) if "notes" in df.columns and pd.notna(row.get("notes")) else "",
            ))
            count += 1
        return count

    # ──────────────────────────────────────────────────────────────────────────
    # Persistence
    # ──────────────────────────────────────────────────────────────────────────

    def save(self, base_path: Path) -> None:
        """Save catalog to JSON files."""
        base_path.mkdir(parents=True, exist_ok=True)

        # Turbines
        pd.DataFrame([t.to_dict() for t in self.turbines.values()]).to_json(
            base_path / "turbines.json", orient="records", indent=2
        )

        # Sensors
        pd.DataFrame([s.to_dict() for s in self.sensors.values()]).to_json(
            base_path / "sensors.json", orient="records", indent=2
        )

        # Alarm mappings
        pd.DataFrame([m.to_dict() for m in self.alarm_mappings.values()]).to_json(
            base_path / "alarm_mappings.json", orient="records", indent=2
        )

    def load(self, base_path: Path) -> None:
        """Load catalog from JSON files."""
        # Turbines
        turbines_file = base_path / "turbines.json"
        if turbines_file.exists():
            df = pd.read_json(turbines_file, orient="records")
            for _, row in df.iterrows():
                self.add_turbine(TurbineInfo(**row.to_dict()))

        # Sensors
        sensors_file = base_path / "sensors.json"
        if sensors_file.exists():
            df = pd.read_json(sensors_file, orient="records")
            for _, row in df.iterrows():
                self.add_sensor(SensorInfo(**row.to_dict()))

        # Alarm mappings
        mappings_file = base_path / "alarm_mappings.json"
        if mappings_file.exists():
            df = pd.read_json(mappings_file, orient="records")
            for _, row in df.iterrows():
                self.add_alarm_mapping(AlarmSensorMapping(**row.to_dict()))


# ──────────────────────────────────────────────────────────────────────────────
# Default Catalog for WindSage Demo Data
# ──────────────────────────────────────────────────────────────────────────────

def create_default_catalog() -> MappingCatalog:
    """Create a catalog with the known turbines from seed data."""
    catalog = MappingCatalog()

    # Turbines from seed SQL
    turbines = [
        TurbineInfo("WT-01", "Turbine 01", "North Ridge", "WS-3.5", 3500),
        TurbineInfo("WT-02", "Turbine 02", "North Ridge", "WS-3.5", 3500),
        TurbineInfo("WT-03", "Turbine 03", "North Ridge", "WS-3.5", 3500),
        TurbineInfo("WT-04", "Turbine 04", "North Ridge", "WS-3.5", 3500),
        TurbineInfo("WT-05", "Turbine 05", "South Mesa", "WS-3.5", 3500),
        TurbineInfo("WT-06", "Turbine 06", "South Mesa", "WS-3.5", 3500),
        TurbineInfo("WT-07", "Turbine 07", "South Mesa", "WS-3.5", 3500),
        TurbineInfo("WT-08", "Turbine 08", "East Point", "WS-3.5", 3500),
        TurbineInfo("WT-09", "Turbine 09", "East Point", "WS-3.5", 3500),
        TurbineInfo("WT-10", "Turbine 10", "East Point", "WS-3.5", 3500),
    ]
    for t in turbines:
        catalog.add_turbine(t)

    # Alarm-to-sensor type mappings (no specific sensor IDs available in dataset)
    catalog.add_alarm_mapping(AlarmSensorMapping(
        alarm_code="VIB-201",
        alarm_description="Drivetrain vibration above warning threshold",
        primary_sensor_type="vibration",
        notes="Maps to vibration sensor on drivetrain/gearbox. Specific sensor ID not in dataset.",
    ))
    catalog.add_alarm_mapping(AlarmSensorMapping(
        alarm_code="TMP-310",
        alarm_description="Gearbox oil temperature high",
        primary_sensor_type="temperature",
        notes="Maps to gearbox oil temperature sensor. Specific sensor ID not in dataset.",
    ))
    catalog.add_alarm_mapping(AlarmSensorMapping(
        alarm_code="HYD-410",
        alarm_description="Hydraulic pressure outside operating band",
        primary_sensor_type="pressure",
        notes="Maps to hydraulic system pressure transducer. Specific sensor ID not in dataset.",
    ))
    catalog.add_alarm_mapping(AlarmSensorMapping(
        alarm_code="COM-101",
        alarm_description="Controller communication timeout",
        primary_sensor_type="other",
        notes="Communication alarm — no physical sensor. Reported by SCADA controller.",
    ))
    catalog.add_alarm_mapping(AlarmSensorMapping(
        alarm_code="PIT-220",
        alarm_description="Pitch actuator response slow",
        primary_sensor_type="other",
        notes="Pitch system actuator position/speed sensor. Specific sensor ID not in dataset.",
    ))

    return catalog


# ──────────────────────────────────────────────────────────────────────────────
# Query Helpers
# ──────────────────────────────────────────────────────────────────────────────

def enrich_alarm_with_mapping(
    alarm: dict,
    catalog: MappingCatalog,
) -> dict:
    """
    Enrich an alarm record with sensor/turbine metadata.
    Returns a new dict with added fields.
    """
    enriched = alarm.copy()
    turbine_id = alarm.get("turbine_id")
    alarm_code = alarm.get("alarm_code")

    # Turbine info
    turbine = catalog.get_turbine(turbine_id)
    if turbine:
        enriched["turbine_name"] = turbine.name
        enriched["turbine_site"] = turbine.site or UNKNOWN_TURBINE_MSG
        enriched["turbine_model"] = turbine.model
        enriched["turbine_capacity_kw"] = turbine.capacity_kw
    else:
        enriched["turbine_name"] = turbine_id
        enriched["turbine_site"] = UNKNOWN_TURBINE_MSG
        enriched["turbine_model"] = None
        enriched["turbine_capacity_kw"] = None

    # Sensor info
    sensor_id, sensor_type, sensor_location = catalog.get_sensor_for_alarm(alarm_code, turbine_id)
    enriched["reporting_sensor_id"] = sensor_id
    enriched["reporting_sensor_type"] = sensor_type
    enriched["reporting_sensor_location"] = sensor_location

    # Alarm mapping notes
    mapping = catalog.get_alarm_mapping(alarm_code)
    enriched["alarm_sensor_notes"] = mapping.notes

    return enriched


if __name__ == "__main__":
    # Demo
    catalog = create_default_catalog()

    print("=== Turbines ===")
    for t in catalog.list_turbines():
        print(f"  {t.turbine_id}: {t.name} @ {t.site}")

    print("\n=== Alarm Mappings ===")
    for code in ["VIB-201", "TMP-310", "HYD-410", "COM-101", "PIT-220", "UNKNOWN-999"]:
        mapping = catalog.get_alarm_mapping(code)
        print(f"  {code}: {mapping.primary_sensor_type} — {mapping.notes}")

    print("\n=== Sensor Lookup for VIB-201 on WT-03 ===")
    sensor_id, sensor_type, sensor_loc = catalog.get_sensor_for_alarm("VIB-201", "WT-03")
    print(f"  Sensor ID: {sensor_id}")
    print(f"  Sensor Type: {sensor_type}")
    print(f"  Sensor Location: {sensor_loc}")

    print("\n=== Enrichment Demo ===")
    alarm = {"alarm_id": "ALM-1001", "turbine_id": "WT-03", "alarm_code": "VIB-201", "description": "Drivetrain vibration"}
    enriched = enrich_alarm_with_mapping(alarm, catalog)
    for k, v in enriched.items():
        print(f"  {k}: {v}")