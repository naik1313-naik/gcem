import { describe, expect, it } from "vitest";

import {
  parseCsvText,
  buildCsvFromRecords,
  extractDateRange,
} from "@/lib/csv-client";

describe("Client-side CSV parsing", () => {
  it("parses a simple CSV without errors", () => {
    const csv = "alarm_id,timestamp,turbine_id,alarm_code\nALM-1,2026-10-20T06:00:00Z,WT-01,VIB-201";
    const result = parseCsvText(csv);
    expect(result.parseError).toBeUndefined();
    expect(result.headers).toEqual(["alarm_id", "timestamp", "turbine_id", "alarm_code"]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      alarm_id: "ALM-1",
      turbine_id: "WT-01",
      alarm_code: "VIB-201",
    });
  });

  it("handles quoted fields with embedded commas", () => {
    const csv = 'alarm_id,description,turbine_id\nALM-1,"Vibration, high reading",WT-01';
    const result = parseCsvText(csv);
    expect(result.parseError).toBeUndefined();
    expect(result.records).toHaveLength(1);
    expect(result.records[0].description).toBe("Vibration, high reading");
  });

  it("handles quoted fields with doubled quotes", () => {
    const csv = 'alarm_id,description,turbine_id\nALM-1,"Vibration ""high"" reading",WT-01';
    const result = parseCsvText(csv);
    expect(result.parseError).toBeUndefined();
    expect(result.records).toHaveLength(1);
    expect(result.records[0].description).toBe('Vibration "high" reading');
  });

  it("strips BOM", () => {
    const csv = '\uFEFFalarm_id,timestamp,turbine_id\nALM-1,2026-10-20T06:00:00Z,WT-01';
    const result = parseCsvText(csv);
    expect(result.parseError).toBeUndefined();
    expect(result.headers).toEqual(["alarm_id", "timestamp", "turbine_id"]);
    expect(result.records).toHaveLength(1);
  });

  it("returns fatal error for empty file", () => {
    const result = parseCsvText("");
    expect(result.parseError).toContain("Empty");
    expect(result.records).toHaveLength(0);
  });

  it("skips fully empty rows", () => {
    const csv = "alarm_id,timestamp,turbine_id\nALM-1,2026-10-20T06:00:00Z,WT-01\n\nALM-2,2026-10-20T07:00:00Z,WT-02";
    const result = parseCsvText(csv);
    expect(result.parseError).toBeUndefined();
    expect(result.records).toHaveLength(2);
  });

  it("handles newlines within quoted fields", () => {
    const csv = 'alarm_id,description,turbine_id\nALM-1,"Line 1\nLine 2",WT-01';
    const result = parseCsvText(csv);
    expect(result.parseError).toBeUndefined();
    expect(result.records).toHaveLength(1);
    expect(result.records[0].description).toBe("Line 1\nLine 2");
  });

  it("builds CSV from records with proper escaping", () => {
    const records = [
      { alarm_id: "ALM-1", description: 'Vibration, "high" reading', turbine_id: "WT-01" },
      { alarm_id: "ALM-2", description: "Simple", turbine_id: "WT-02" },
    ];
    const csv = buildCsvFromRecords(records);
    expect(csv).toContain('"Vibration, ""high"" reading"');
    expect(csv).toContain("ALM-1");
    expect(csv).toContain("ALM-2");
  });

  it("extracts date range from timestamp columns", () => {
    const records = [
      { timestamp: "2026-10-20T06:00:00Z", turbine_id: "WT-01" },
      { timestamp: "2026-10-22T14:00:00Z", turbine_id: "WT-02" },
      { timestamp: "2026-10-21T08:00:00Z", turbine_id: "WT-03" },
    ];
    const range = extractDateRange(records, ["timestamp", "turbine_id"]);
    expect(range.min).toBe("2026-10-20T06:00:00.000Z");
    expect(range.max).toBe("2026-10-22T14:00:00.000Z");
  });

  it("returns null date range when no timestamp columns", () => {
    const records = [{ alarm_id: "ALM-1", turbine_id: "WT-01" }];
    const range = extractDateRange(records, ["alarm_id", "turbine_id"]);
    expect(range.min).toBeNull();
    expect(range.max).toBeNull();
  });
});
