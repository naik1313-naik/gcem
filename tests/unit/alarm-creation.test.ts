import { describe, expect, it } from "vitest";

import { prepareAlarmForInsert } from "@/lib/alarm-creation";
import type { AlarmInsert } from "@/lib/types";

const base: AlarmInsert = {
  alarm_id: "ALM-9500",
  turbine_id: "WT-03",
  alarm_code: "VIB-201",
  description: "Drivetrain vibration above warning threshold",
  severity: "Critical",
  timestamp: "2026-10-23T09:00:00.000Z",
  duration_min: 190,
  status: "Active",
  vibration_mm_s: 11.4,
  temperature_c: 79,
  hydraulic_pressure_bar: 165,
  estimated_power_kw: 1800,
};

describe("alarm creation payload", () => {
  it("adds a rule-based root cause and source before insert", () => {
    const prepared = prepareAlarmForInsert(base);
    expect(prepared.suggested_root_cause).toContain("Drivetrain");
    expect(prepared.source).toBe("manual");
    expect(prepared.alarm_id).toBe(base.alarm_id);
    expect(prepared.vibration_mm_s).toBe(11.4);
  });

  it("preserves a manually supplied root cause and source", () => {
    const prepared = prepareAlarmForInsert({
      ...base,
      suggested_root_cause: "Confirmed bearing wear",
      source: "manual-entry",
    });
    expect(prepared.suggested_root_cause).toBe("Confirmed bearing wear");
    expect(prepared.source).toBe("manual-entry");
  });

  it("keeps CSV provenance for imported alarms", () => {
    expect(prepareAlarmForInsert({ ...base, source: "csv" }).source).toBe("csv");
  });
});
