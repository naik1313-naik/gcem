import { describe, expect, it } from "vitest";

import {
  categoryForAlarm,
  consoleStats,
  estimatedMwh,
  getAllDepartmentMappings,
  priorityForAlarm,
  recommendDepartment,
  recurrenceByTurbineAndCode,
  recurrenceGroups,
  recurrenceInRange,
  searchRecurrence,
  topRecurringAlarms,
  topRecurringTurbines,
  workflowStatus,
} from "@/lib/console";
import type { AlarmRecord, MaintenanceIncident } from "@/lib/types";

const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);

function isoDaysAgo(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString();
}

function alarm(overrides: Partial<AlarmRecord>): AlarmRecord {
  return {
    id: "demo-1",
    alarm_id: "ALM-1",
    turbine_id: "WT-03",
    alarm_code: "VIB-201",
    description: "Drivetrain vibration above warning threshold",
    severity: "High",
    timestamp: isoDaysAgo(2),
    duration_min: 60,
    status: "Active",
    vibration_mm_s: 9,
    temperature_c: 70,
    hydraulic_pressure_bar: 170,
    estimated_power_kw: 1800,
    suggested_root_cause: "Bearing",
    confirmed_root_cause: null,
    technician: null,
    department_recommendation: null,
    department_confidence: null,
    department_is_provisional: null,
    department_review_status: null,
    resolution_notes: null,
    source: "test",
    created_at: isoDaysAgo(2),
    updated_at: isoDaysAgo(2),
    ...overrides,
  };
}

function incident(overrides: Partial<MaintenanceIncident>): MaintenanceIncident {
  return {
    id: "incident-1",
    alarm_id: "ALM-1",
    turbine_id: "WT-03",
    title: "Inspect bearing",
    technician: "Alex Morgan",
    priority: "High",
    due_date: null,
    status: "Assigned",
    notes: null,
    resolution_summary: null,
    created_at: isoDaysAgo(1),
    updated_at: isoDaysAgo(1),
    resolved_at: null,
    ...overrides,
  };
}

describe("console helpers", () => {
  it("maps alarm codes to categories and estimates energy loss", () => {
    expect(categoryForAlarm({ alarm_code: "VIB-201" }).label).toBe("Drivetrain");
    expect(categoryForAlarm({ alarm_code: "COM-101" }).team).toBe("SCADA / Controls");
    expect(estimatedMwh(alarm({ duration_min: 120, estimated_power_kw: 2000 }))).toBe(4);
  });

  it("gives a resolved alarm precedence over an open work order", () => {
    expect(
      workflowStatus(alarm({ status: "Resolved" }), incident({ status: "In Progress" })),
    ).toBe("Resolved");
    expect(workflowStatus(alarm({ status: "Active" }), incident({ status: "Assigned" }))).toBe(
      "Assigned",
    );
    expect(workflowStatus(alarm({ status: "Acknowledged" }), null)).toBe("In progress");
  });

  it("creates a recurrence group when a turbine/category reaches three alarms", () => {
    const alarms = [
      alarm({ alarm_id: "A1", timestamp: isoDaysAgo(2) }),
      alarm({ alarm_id: "A2", timestamp: isoDaysAgo(10) }),
      alarm({ alarm_id: "A3", timestamp: isoDaysAgo(40) }),
      alarm({
        alarm_id: "A4",
        alarm_code: "TMP-310",
        timestamp: isoDaysAgo(3),
      }),
      alarm({ alarm_id: "A5", turbine_id: "WT-04", timestamp: isoDaysAgo(1) }),
    ];
    const groups = recurrenceGroups(alarms, NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      turbine: "WT-03",
      categoryLabel: "Drivetrain",
      count: 3,
      active: 3,
      last30: 2,
      prev30: 1,
      trend: "up",
    });
    expect(groups[0].avgGap).toBeGreaterThan(0);
  });

  it("summarises open critical and recurring work", () => {
    const alarms = [
      alarm({ alarm_id: "A1", severity: "Critical", timestamp: isoDaysAgo(2) }),
      alarm({ alarm_id: "A2", timestamp: isoDaysAgo(10) }),
      alarm({ alarm_id: "A3", timestamp: isoDaysAgo(20) }),
      alarm({ alarm_id: "A4", status: "Resolved", timestamp: isoDaysAgo(4) }),
    ];
    const incidents = [
      incident({ id: "i1", status: "Resolved", resolved_at: isoDaysAgo(0) }),
      incident({ id: "i2", status: "Assigned", due_date: "2026-10-20" }),
    ];
    const stats = consoleStats(alarms, incidents, NOW);

    expect(stats.open).toBe(3);
    expect(stats.criticalOpen).toBe(1);
    expect(stats.recurring).toBe(1);
    expect(stats.overdue).toBe(1);
    expect(stats.mttr).not.toBeNull();
    expect(stats.loss30).toBeGreaterThan(0);
  });

  it("ranks high-severity recurring alarms as P1", () => {
    const priority = priorityForAlarm(
      alarm({ severity: "Critical", duration_min: 190, estimated_power_kw: 1200 }),
      10,
    );
    expect(priority.rank).toBe("P1");
    expect(priority.score).toBeGreaterThanOrEqual(75);
  });
});

describe("recurrence by turbine and code", () => {
  const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);

  function isoDaysAgo(days: number): string {
    return new Date(NOW - days * 86_400_000).toISOString();
  }

  it("computes recurrence counts grouped by turbine and alarm code", () => {
    const alarms = [
      alarm({ alarm_id: "A1", turbine_id: "WT-03", alarm_code: "VIB-201", timestamp: isoDaysAgo(2) }),
      alarm({ alarm_id: "A2", turbine_id: "WT-03", alarm_code: "VIB-201", timestamp: isoDaysAgo(10) }),
      alarm({ alarm_id: "A3", turbine_id: "WT-03", alarm_code: "TMP-310", timestamp: isoDaysAgo(5) }),
      alarm({ alarm_id: "A4", turbine_id: "WT-07", alarm_code: "VIB-201", timestamp: isoDaysAgo(1) }),
    ];
    const result = recurrenceByTurbineAndCode(alarms, NOW);

    expect(result).toHaveLength(3);
    const vib201wt03 = result.find((r) => r.turbine_id === "WT-03" && r.alarm_code === "VIB-201");
    expect(vib201wt03?.total_occurrences).toBe(2);
    expect(vib201wt03?.first_occurrence).toBe(isoDaysAgo(10));
    expect(vib201wt03?.last_occurrence).toBe(isoDaysAgo(2));
    const tmp310wt03 = result.find((r) => r.turbine_id === "WT-03" && r.alarm_code === "TMP-310");
    expect(tmp310wt03?.total_occurrences).toBe(1);
  });

  it("counts occurrences within a date range", () => {
    const alarms = [
      alarm({ alarm_id: "A1", turbine_id: "WT-03", alarm_code: "VIB-201", timestamp: isoDaysAgo(2) }),
      alarm({ alarm_id: "A2", turbine_id: "WT-03", alarm_code: "VIB-201", timestamp: isoDaysAgo(10) }),
      alarm({ alarm_id: "A3", turbine_id: "WT-03", alarm_code: "VIB-201", timestamp: isoDaysAgo(40) }),
    ];
    // Range Oct 1-23 includes isoDaysAgo(2)=Oct 21 and isoDaysAgo(10)=Oct 13,
    // but not isoDaysAgo(40)=Sep 13
    const count = recurrenceInRange(alarms, "WT-03", "VIB-201", "2026-10-01", "2026-10-23");
    expect(count).toBe(2);
  });

  it("returns top recurring alarms sorted by count", () => {
    const alarms = [
      alarm({ alarm_id: "A1", turbine_id: "WT-03", alarm_code: "VIB-201", timestamp: isoDaysAgo(2) }),
      alarm({ alarm_id: "A2", turbine_id: "WT-03", alarm_code: "VIB-201", timestamp: isoDaysAgo(10) }),
      alarm({ alarm_id: "A3", turbine_id: "WT-03", alarm_code: "VIB-201", timestamp: isoDaysAgo(20) }),
      alarm({ alarm_id: "A4", turbine_id: "WT-07", alarm_code: "COM-101", timestamp: isoDaysAgo(5) }),
      alarm({ alarm_id: "A5", turbine_id: "WT-07", alarm_code: "COM-101", timestamp: isoDaysAgo(15) }),
    ];
    const top = topRecurringAlarms(alarms, 3);
    expect(top[0].total_occurrences).toBe(3);
    expect(top[0].turbine_id).toBe("WT-03");
    expect(top[0].alarm_code).toBe("VIB-201");
    expect(top[1].total_occurrences).toBe(2);
  });

  it("returns top recurring turbines", () => {
    const alarms = [
      alarm({ alarm_id: "A1", turbine_id: "WT-03", alarm_code: "VIB-201", timestamp: isoDaysAgo(2) }),
      alarm({ alarm_id: "A2", turbine_id: "WT-03", alarm_code: "TMP-310", timestamp: isoDaysAgo(10) }),
      alarm({ alarm_id: "A3", turbine_id: "WT-07", alarm_code: "VIB-201", timestamp: isoDaysAgo(5) }),
    ];
    const top = topRecurringTurbines(alarms, 5);
    expect(top[0].turbine_id).toBe("WT-03");
    expect(top[0].total_alarms).toBe(2);
    expect(top[0].unique_codes).toBe(2);
    expect(top[1].turbine_id).toBe("WT-07");
    expect(top[1].total_alarms).toBe(1);
  });

  it("searches recurrence by turbine, code, or description", () => {
    const alarms = [
      alarm({ alarm_id: "A1", turbine_id: "WT-03", alarm_code: "VIB-201", description: "Drivetrain vibration", timestamp: isoDaysAgo(2) }),
      alarm({ alarm_id: "A2", turbine_id: "WT-07", alarm_code: "COM-101", description: "Controller timeout", timestamp: isoDaysAgo(5) }),
    ];
    const byTurbine = searchRecurrence(alarms, "WT-03");
    expect(byTurbine).toHaveLength(1);
    expect(byTurbine[0].turbine_id).toBe("WT-03");

    const byCode = searchRecurrence(alarms, "COM");
    expect(byCode).toHaveLength(1);
    expect(byCode[0].alarm_code).toBe("COM-101");

    const byDesc = searchRecurrence(alarms, "vibration");
    expect(byDesc).toHaveLength(1);
    expect(byDesc[0].alarm_description).toBe("Drivetrain vibration");
  });
});

describe("department classification", () => {
  it("recommends Mechanical Engineering for vibration alarms", () => {
    const rec = recommendDepartment("VIB-201", "Drivetrain vibration above warning threshold");
    expect(rec.recommended_department).toBe("Mechanical Engineering");
    expect(rec.confidence).toBeGreaterThan(0.8);
    expect(rec.is_provisional).toBe(true);
    expect(rec.review_status).toBe("pending");
  });

  it("recommends Controls/Software Engineering for communication alarms", () => {
    const rec = recommendDepartment("COM-101", "Controller communication timeout");
    expect(rec.recommended_department).toBe("Controls/Software Engineering");
    expect(rec.confidence).toBeGreaterThan(0.8);
    expect(rec.is_provisional).toBe(true);
  });

  it("recommends Electrical Engineering for pitch alarms", () => {
    const rec = recommendDepartment("PIT-220", "Pitch actuator response slow");
    expect(rec.recommended_department).toBe("Electrical Engineering");
    expect(rec.confidence).toBeGreaterThan(0.7);
  });

  it("routes unknown alarms to Human Review", () => {
    const rec = recommendDepartment("UNK-999", "Unclassified fault");
    expect(rec.recommended_department).toBe("Unknown / Human Review");
    expect(rec.confidence).toBe(0.0);
    expect(rec.review_status).toBe("pending");
  });

  it("returns all documented mappings", () => {
    const mappings = getAllDepartmentMappings();
    expect(mappings.length).toBeGreaterThan(0);
    expect(mappings.every((m) => m.is_provisional)).toBe(true);
    expect(mappings.some((m) => m.alarm_code === "VIB-201")).toBe(true);
  });
});
