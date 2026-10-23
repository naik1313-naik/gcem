import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { alarmTemplateCsv, buildAlarmCsv, parseAlarmCsv } from "@/lib/csv";

const sample = readFileSync(resolve("sample_data/synthetic_alarms.csv"), "utf8");

describe("CSV parsing", () => {
  it("parses the existing sample CSV without errors", () => {
    const result = parseAlarmCsv(sample);
    expect(result.fatalError).toBeUndefined();
    expect(result.totalRows).toBe(7);
    expect(result.rows).toHaveLength(7);
    expect(result.errors).toHaveLength(0);
    expect(result.duplicates).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({
      alarm_id: "ALM-1001",
      turbine_id: "WT-03",
      alarm_code: "VIB-201",
      severity: "Critical",
      status: "Active",
      vibration_mm_s: 11.4,
    });
    expect(result.rows[0].timestamp).toBe("2026-10-20T06:15:00.000Z");
  });

  it("normalizes severity and status casing", () => {
    const csv = sample
      .replace(",Critical,", ",critical,")
      .replace(",Active,", ",active,");
    const result = parseAlarmCsv(csv);
    expect(result.rows[0].severity).toBe("Critical");
    expect(result.rows[0].status).toBe("Active");
  });

  it("reports missing required headers", () => {
    const result = parseAlarmCsv("alarm_id,timestamp,turbine_id\nALM-1,2026-10-20T06:00:00Z,WT-01");
    expect(result.fatalError).toContain("Missing required column");
    expect(result.missingHeaders).toContain("severity");
  });

  it("collects row-level validation errors", () => {
    const csv = [
      "alarm_id,timestamp,turbine_id,alarm_code,description,severity,duration_min,status",
      "ALM-9001,not-a-date,WT-01,VIB-201,Test,Critical,20,Active",
      "ALM-9002,2026-10-20T06:00:00Z,WT-01,VIB-201,Test,Urgent,20,Active",
      "ALM-9003,2026-10-20T06:00:00Z,WT-01,VIB-201,Test,High,-5,Active",
    ].join("\n");
    const result = parseAlarmCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain("timestamp");
    expect(result.errors[1].message).toContain("severity");
    expect(result.errors[2].message).toContain("duration_min");
  });

  it("detects duplicate alarm IDs within a file", () => {
    const row = "ALM-9004,2026-10-20T06:00:00Z,WT-01,VIB-201,Test,High,20,Active";
    const csv = [
      "alarm_id,timestamp,turbine_id,alarm_code,description,severity,duration_min,status",
      row,
      row,
    ].join("\n");
    const result = parseAlarmCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].reason).toContain("row 2");
  });

  it("detects turbine/timestamp/code duplicates with different IDs", () => {
    const csv = [
      "alarm_id,timestamp,turbine_id,alarm_code,description,severity,duration_min,status",
      "ALM-9005,2026-10-20T06:00:00Z,WT-01,VIB-201,Test,High,20,Active",
      "ALM-9006,2026-10-20T06:00:00Z,WT-01,VIB-201,Test,High,20,Active",
    ].join("\n");
    const result = parseAlarmCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.duplicates[0].reason).toContain("Same turbine, timestamp, and alarm code");
  });

  it("applies default sensor values when optional columns are blank", () => {
    const csv = [
      "alarm_id,timestamp,turbine_id,alarm_code,description,severity,duration_min,status,vibration_mm_s,temperature_c,hydraulic_pressure_bar,estimated_power_kw",
      "ALM-9007,2026-10-20T06:00:00Z,WT-01,VIB-201,Test,High,20,Active,,,,",
    ].join("\n");
    const result = parseAlarmCsv(csv);
    expect(result.rows[0]).toMatchObject({
      vibration_mm_s: 0,
      temperature_c: 0,
      hydraulic_pressure_bar: 170,
      estimated_power_kw: 2500,
    });
  });

  it("rejects imports over 1,000 rows", () => {
    const header =
      "alarm_id,timestamp,turbine_id,alarm_code,description,severity,duration_min,status";
    const rows = Array.from(
      { length: 1001 },
      (_, index) =>
        `ALM-${10_000 + index},2026-10-20T06:00:00Z,WT-01,VIB-201,Test,High,20,Active`,
    );
    const result = parseAlarmCsv([header, ...rows].join("\n"));
    expect(result.fatalError).toContain("1,000");
  });

  it("returns a fatal error for an empty file", () => {
    expect(parseAlarmCsv("").fatalError).toContain("empty");
  });
});

describe("CSV export and template", () => {
  it("round-trips the template through the parser", () => {
    const result = parseAlarmCsv(alarmTemplateCsv());
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].alarm_id).toBe("ALM-TEMPLATE-001");
  });

  it("escapes commas and quotes in descriptions", () => {
    const csv = buildAlarmCsv([
      {
        alarm_id: "ALM-9010",
        timestamp: "2026-10-20T06:00:00.000Z",
        turbine_id: "WT-01",
        alarm_code: "VIB-201",
        description: 'Vibration, "high" reading',
        severity: "High",
        duration_min: 20,
        status: "Active",
        vibration_mm_s: 8.2,
        temperature_c: 70,
        hydraulic_pressure_bar: 170,
        estimated_power_kw: 2400,
      },
    ]);
    expect(csv).toContain('"Vibration, ""high"" reading"');
    const parsed = parseAlarmCsv(csv);
    expect(parsed.rows[0].description).toBe('Vibration, "high" reading');
  });

  it("neutralizes spreadsheet formula injection in exported text", () => {
    const csv = buildAlarmCsv([
      {
        alarm_id: "ALM-9011",
        timestamp: "2026-10-20T06:00:00.000Z",
        turbine_id: "WT-01",
        alarm_code: "VIB-201",
        description: "=HYPERLINK(\"https://example.com\")",
        severity: "High",
        duration_min: 20,
        status: "Active",
      },
    ]);
    expect(csv).toContain("'=HYPERLINK");
  });
});
