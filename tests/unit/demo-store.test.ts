import { beforeEach, describe, expect, it } from "vitest";

import { findDemoAccount } from "@/lib/demo-accounts";
import {
  demoAlarmRecurrence,
  demoCreateIncident,
  demoGetAlarm,
  demoGetIncident,
  demoImportAlarms,
  demoListAlarms,
  demoListIncidents,
  demoListRecentAudit,
  demoUpdateAlarm,
  demoUpdateIncident,
  resetDemoStore,
} from "@/lib/demo-store";
import type { AlarmFilters, AlarmInsert } from "@/lib/types";

const filters: AlarmFilters = {
  turbine: "",
  severities: [],
  statuses: [],
  q: "",
  exactDate: "",
  from: "",
  to: "",
  sort: "newest",
};

const newAlarm: AlarmInsert = {
  alarm_id: "ALM-DEMO-NEW",
  turbine_id: "WT-03",
  alarm_code: "VIB-201",
  description: "Drivetrain vibration above warning threshold",
  severity: "Critical",
  timestamp: "2026-10-23T12:00:00.000Z",
  duration_min: 65,
  status: "Active",
  vibration_mm_s: 12.6,
  temperature_c: 81,
  hydraulic_pressure_bar: 160,
  estimated_power_kw: 1780,
};

beforeEach(() => {
  resetDemoStore();
});

describe("demo accounts", () => {
  it("accepts the documented admin credentials and rejects a bad password", () => {
    expect(findDemoAccount("admin@windsage.demo", "Admin@123")?.role).toBe("Admin");
    expect(findDemoAccount("ADMIN@WINDSAGE.DEMO", "Admin@123")?.email).toBe(
      "admin@windsage.demo",
    );
    expect(findDemoAccount("admin@windsage.demo", "wrong")).toBeNull();
  });
});

describe("in-memory demo repository", () => {
  it("seeds alarms and applies exact-date plus department filters", () => {
    const all = demoListAlarms(filters, 500);
    expect(all.length).toBe(117);

    const onOctober23 = demoListAlarms({ ...filters, exactDate: "2026-10-23" }, 500);
    expect(onOctober23.some((alarm) => alarm.alarm_id === "ALM-1007")).toBe(true);
    expect(onOctober23.every((alarm) => alarm.timestamp.startsWith("2026-10-23"))).toBe(true);

    const wt03 = demoListAlarms({ ...filters, turbine: "WT-03" }, 500);
    expect(wt03.length).toBeGreaterThan(0);
    expect(wt03.every((alarm) => alarm.turbine_id === "WT-03")).toBe(true);
  });

  it("updates an alarm and records recurrence", () => {
    const before = demoGetAlarm("ALM-1001");
    expect(before?.status).toBe("Active");
    const count = demoAlarmRecurrence("WT-03", "VIB-201");

    const updated = demoUpdateAlarm("ALM-1001", {
      status: "Resolved",
      technician: "Ravi Mechanical",
      confirmed_root_cause: "Bearing wear confirmed on inspection",
      resolution_notes: "Bearing set replaced and vibration rechecked.",
    });

    expect(updated.status).toBe("Resolved");
    expect(updated.technician).toBe("Ravi Mechanical");
    expect(demoGetAlarm("ALM-1001")?.confirmed_root_cause).toContain("Bearing wear");
    expect(demoAlarmRecurrence("WT-03", "VIB-201")).toBe(count);
  });

  it("imports once and reports a duplicate on the second attempt", () => {
    const first = demoImportAlarms([newAlarm]);
    expect(first.imported).toBe(1);
    expect(first.duplicates).toHaveLength(0);

    const second = demoImportAlarms([newAlarm]);
    expect(second.imported).toBe(0);
    expect(second.duplicates).toHaveLength(1);
  });

  it("creates and resolves a maintenance incident with audit history", () => {
    const beforeAudit = demoListRecentAudit(50).length;
    const incident = demoCreateIncident({
      alarm_id: "ALM-1001",
      turbine_id: "WT-03",
      title: "Demo inspection",
      technician: "Ravi Mechanical",
      priority: "High",
      due_date: "2026-10-26",
      notes: "Created by the demo repository test.",
    });

    expect(incident.status).toBe("Assigned");
    expect(demoListIncidents().some((row) => row.id === incident.id)).toBe(true);

    const resolved = demoUpdateIncident(incident.id, {
      status: "Resolved",
      technician: "Ravi Mechanical",
      priority: "High",
      due_date: "2026-10-26",
      notes: incident.notes,
      resolution_summary: "Inspection complete.",
    });

    expect(resolved.status).toBe("Resolved");
    expect(resolved.resolved_at).toBeTruthy();
    expect(demoGetIncident(incident.id)?.resolution_summary).toBe("Inspection complete.");
    expect(demoListRecentAudit(50).length).toBeGreaterThan(beforeAudit);
  });
});
