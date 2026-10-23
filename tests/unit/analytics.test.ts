import { describe, expect, it } from "vitest";

import { computeLostProduction, meanMttrHours } from "@/lib/analytics";
import type { AlarmRecord, MaintenanceIncident } from "@/lib/types";

function alarm(overrides: Partial<AlarmRecord>): AlarmRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    alarm_id: overrides.alarm_id ?? `ALM-${Math.random()}`,
    turbine_id: "WT-01",
    alarm_code: "VIB-201",
    description: "Test alarm",
    severity: "High",
    timestamp: "2026-10-20T00:00:00.000Z",
    duration_min: 60,
    status: "Active",
    vibration_mm_s: 8,
    temperature_c: 70,
    hydraulic_pressure_bar: 170,
    estimated_power_kw: 2500,
    suggested_root_cause: null,
    confirmed_root_cause: null,
    technician: null,
    department_recommendation: null,
    department_confidence: null,
    department_is_provisional: null,
    department_review_status: null,
    resolution_notes: null,
    source: "test",
    created_at: "2026-10-20T00:00:00.000Z",
    updated_at: "2026-10-20T00:00:00.000Z",
    ...overrides,
  };
}

function incident(overrides: Partial<MaintenanceIncident>): MaintenanceIncident {
  return {
    id: crypto.randomUUID(),
    alarm_id: "ALM-1",
    turbine_id: "WT-01",
    title: "Test",
    technician: "Alex Morgan",
    priority: "High",
    due_date: "2026-10-24",
    status: "Resolved",
    notes: null,
    resolution_summary: null,
    created_at: "2026-10-20T00:00:00.000Z",
    updated_at: "2026-10-21T00:00:00.000Z",
    resolved_at: "2026-10-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("lost-production analytics", () => {
  it("merges overlapping alarms per turbine without double-counting", () => {
    const result = computeLostProduction([
      alarm({ alarm_id: "A", duration_min: 60, estimated_power_kw: 2500 }),
      alarm({
        alarm_id: "B",
        timestamp: "2026-10-20T00:30:00.000Z",
        duration_min: 60,
        estimated_power_kw: 1500,
      }),
    ]);

    expect(result.totalKwh).toBe(3000);
    expect(result.byTurbine).toEqual([{ turbine: "WT-01", lossKwh: 3000 }]);
    expect(result.baselineKwh).toBe(84_000);
    expect(result.percent).toBeCloseTo(3.5714, 3);
  });

  it("keeps separate turbines separate", () => {
    const result = computeLostProduction([
      alarm({ alarm_id: "A", turbine_id: "WT-01", duration_min: 60, estimated_power_kw: 2500 }),
      alarm({ alarm_id: "B", turbine_id: "WT-02", duration_min: 60, estimated_power_kw: 1500 }),
    ]);

    expect(result.totalKwh).toBe(3000);
    expect(result.byTurbine).toHaveLength(2);
    expect(result.byTurbine[0].turbine).toBe("WT-02");
    expect(result.baselineKwh).toBe(168_000);
  });

  it("returns zero percentages when there is no data", () => {
    const result = computeLostProduction([]);
    expect(result).toMatchObject({ totalKwh: 0, percent: 0, baselineKwh: 0 });
  });

  it("calculates mean time to repair for resolved incidents only", () => {
    const result = meanMttrHours([
      incident({ resolved_at: "2026-10-22T00:00:00.000Z" }),
      incident({ resolved_at: null }),
      incident({ resolved_at: "2026-10-23T00:00:00.000Z" }),
    ]);
    expect(result).toBe(60);
  });
});
