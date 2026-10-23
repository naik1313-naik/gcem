import { describe, expect, it } from "vitest";

import {
  validateDataset,
  validateRecord,
  gateForDownstreamBots,
  type ValidationResult,
  missingValueTotal,
  summaryMessage,
  type QuarantinedRow,
} from "@/lib/validation-gate";

describe("Client-side validation gate", () => {
  const validRecord = {
    alarm_id: "ALM-1",
    turbine_id: "WT-03",
    alarm_code: "VIB-201",
    description: "Drivetrain vibration above warning threshold",
    severity: "Critical",
    status: "Active",
    timestamp: "2026-10-20T06:15:00Z",
    duration_min: 190,
    vibration_mm_s: 11.4,
    temperature_c: 70,
    hydraulic_pressure_bar: 170,
    estimated_power_kw: 2500,
  };

  it("passes a valid record through the gate", () => {
    const result = validateDataset([validRecord]);
    expect(result.validCount).toBe(1);
    expect(result.invalidCount).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.validRows[0].alarm_id).toBe("ALM-1");
  });

  it("skips records with missing alarm_id", () => {
    const result = validateDataset([{ ...validRecord, alarm_id: "" }]);
    expect(result.validCount).toBe(0);
    expect(result.invalidCount).toBe(1);
    expect(result.errors[0].field).toBe("alarm_id");
  });

  it("skips records with invalid severity", () => {
    const result = validateDataset([{ ...validRecord, severity: "Urgent" }]);
    expect(result.validCount).toBe(0);
    expect(result.errors.some((e) => e.field === "severity")).toBe(true);
  });

  it("skips records with invalid timestamp", () => {
    const result = validateDataset([{ ...validRecord, timestamp: "not-a-date" }]);
    expect(result.validCount).toBe(0);
    expect(result.errors.some((e) => e.field === "timestamp")).toBe(true);
  });

  it("skips records with negative duration", () => {
    const result = validateDataset([{ ...validRecord, duration_min: -5 }]);
    expect(result.validCount).toBe(0);
    expect(result.errors.some((e) => e.field === "duration_min")).toBe(true);
  });

  it("skips records with out-of-range sensor values", () => {
    const result = validateDataset([
      { ...validRecord, vibration_mm_s: 150 },
    ]);
    expect(result.validCount).toBe(0);
    expect(result.errors.some((e) => e.field === "vibration_mm_s")).toBe(true);
  });

  it("processes mixed valid/invalid records, skipping only invalid ones", () => {
    const records = [
      validRecord,
      { ...validRecord, alarm_id: "" }, // invalid
      { ...validRecord, severity: "Urgent" }, // invalid
      { ...validRecord, alarm_id: "ALM-2", turbine_id: "WT-07" }, // valid
    ];
    const result = validateDataset(records);
    expect(result.totalRows).toBe(4);
    expect(result.validCount).toBe(2);
    expect(result.invalidCount).toBe(2);
    expect(result.validRows.map((r) => r.alarm_id)).toEqual(["ALM-1", "ALM-2"]);
  });

  it("gateForDownstreamBots returns only valid records", () => {
    const records = [
      validRecord,
      { ...validRecord, alarm_id: "" }, // invalid - will be skipped
    ];
    const { validRecords, result } = gateForDownstreamBots(records);
    expect(validRecords).toHaveLength(1);
    expect(validRecords[0].alarm_id).toBe("ALM-1");
    expect(result.invalidCount).toBe(1);
  });

  it("validates single record with validateRecord", () => {
    const errors = validateRecord(validRecord, 1);
    expect(errors).toHaveLength(0);

    const invalidErrors = validateRecord({ ...validRecord, alarm_id: "" }, 2);
    expect(invalidErrors.length).toBeGreaterThan(0);
    expect(invalidErrors[0].rowIndex).toBe(2);
  });

  describe("missing optional columns", () => {
    it("does not fail when optional sensor columns are missing", () => {
      const record = {
        ...validRecord,
        vibration_mm_s: undefined,
        temperature_c: null,
        hydraulic_pressure_bar: "",
        estimated_power_kw: undefined,
      };
      const result = validateDataset([record]);
      expect(result.validCount).toBe(1);
      expect(result.invalidCount).toBe(0);
    });

    it("counts missing values for optional sensor columns", () => {
      const record = {
        ...validRecord,
        vibration_mm_s: null,
        temperature_c: undefined,
        hydraulic_pressure_bar: "",
        estimated_power_kw: undefined,
      };
      const result = validateDataset([record]);
      expect(result.missingValues.vibration_mm_s).toBe(1);
      expect(result.missingValues.temperature_c).toBe(1);
      expect(result.missingValues.hydraulic_pressure_bar).toBe(1);
      expect(result.missingValues.estimated_power_kw).toBe(1);
    });

    it("normalizes severity case variants", () => {
      const record = { ...validRecord, severity: "high" };
      const result = validateDataset([record]);
      expect(result.validCount).toBe(1);
      expect(result.validRows[0].severity).toBe("High");
    });

    it("normalizes status case variants", () => {
      const record = { ...validRecord, status: "open" };
      const result = validateDataset([record]);
      expect(result.validCount).toBe(1);
      expect(result.validRows[0].status).toBe("Open");
    });

    it("normalizes in-progress status variant", () => {
      const record = { ...validRecord, status: "In Progress" };
      const result = validateDataset([record]);
      expect(result.validCount).toBe(1);
      expect(result.validRows[0].status).toBe("In Progress");
    });
  });

  describe("missing required columns", () => {
    it("fails when alarm_id is missing entirely", () => {
      const record = { ...validRecord, alarm_id: undefined };
      const result = validateDataset([record]);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(1);
      expect(result.errors.some((e) => e.field === "alarm_id")).toBe(true);
    });

    it("fails when timestamp is missing entirely", () => {
      const record = { ...validRecord, timestamp: undefined };
      const result = validateDataset([record]);
      expect(result.validCount).toBe(0);
      expect(result.errors.some((e) => e.field === "timestamp")).toBe(true);
    });

    it("defaults duration_min to 0 when missing", () => {
      const record = { ...validRecord, duration_min: undefined };
      const result = validateDataset([record]);
      expect(result.validCount).toBe(1);
      expect(result.validRows[0].duration_min).toBe(0);
    });
  });

  describe("non-numeric sensor readings", () => {
    it("rejects non-numeric vibration_mm_s", () => {
      const result = validateDataset([{ ...validRecord, vibration_mm_s: "high" }]);
      expect(result.validCount).toBe(0);
      expect(result.errors.some((e) => e.field === "vibration_mm_s")).toBe(true);
    });

    it("rejects non-numeric temperature_c", () => {
      const result = validateDataset([{ ...validRecord, temperature_c: "hot" }]);
      expect(result.validCount).toBe(0);
      expect(result.errors.some((e) => e.field === "temperature_c")).toBe(true);
    });

    it("rejects out-of-range hydraulic pressure", () => {
      const result = validateDataset([{ ...validRecord, hydraulic_pressure_bar: 600 }]);
      expect(result.validCount).toBe(0);
      expect(result.errors.some((e) => e.field === "hydraulic_pressure_bar")).toBe(true);
    });

    it("rejects out-of-range power", () => {
      const result = validateDataset([{ ...validRecord, estimated_power_kw: 20000 }]);
      expect(result.validCount).toBe(0);
      expect(result.errors.some((e) => e.field === "estimated_power_kw")).toBe(true);
    });
  });

  describe("empty and invalid-only files", () => {
    it("returns empty result for empty file", () => {
      const result = validateDataset([]);
      expect(result.totalRows).toBe(0);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("file with only invalid rows skips all", () => {
      const records = [
        { ...validRecord, alarm_id: "" },
        { ...validRecord, alarm_id: "ALM-2", severity: "Urgent" },
        { ...validRecord, alarm_id: "ALM-3", timestamp: "not-a-date" },
      ];
      const result = validateDataset(records);
      expect(result.totalRows).toBe(3);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(3);
      expect(result.validRows).toHaveLength(0);
    });
  });

  describe("missing value counts and error grouping", () => {
    it("counts missing required fields", () => {
      const records = [
        { ...validRecord, alarm_id: "" },
        { ...validRecord, alarm_id: "ALM-2", severity: "" },
        { ...validRecord, alarm_id: "ALM-3", timestamp: undefined },
      ];
      const result = validateDataset(records);
      expect(result.missingValues.alarm_id).toBe(1);
      expect(result.missingValues.severity).toBe(1);
      expect(result.missingValues.timestamp).toBe(1);
    });

    it("groups errors by reason", () => {
      const records = [
        { ...validRecord, alarm_id: "" },
        { ...validRecord, alarm_id: "" },
        { ...validRecord, alarm_id: "ALM-3", severity: "Bad" },
      ];
      const result = validateDataset(records);
      expect(result.errorsByReason["alarm_id"]).toBe(2);
      expect(result.errorsByReason["severity"]).toBe(1);
    });

    it("computes missing value total", () => {
      const records = [
        { ...validRecord, alarm_id: "", severity: "" },
        { ...validRecord, alarm_id: "ALM-2", timestamp: undefined },
      ];
      const result = validateDataset(records);
      expect(missingValueTotal(result.missingValues)).toBe(3);
    });

    it("produces a human-readable summary message", () => {
      const records = [
        validRecord,
        { ...validRecord, alarm_id: "" },
      ];
      const result = validateDataset(records);
      const msg = summaryMessage(result);
      expect(msg).toContain("2 row(s)");
      expect(msg).toContain("1 valid");
      expect(msg).toContain("1 invalid");
    });
  });

  describe("quarantined row structure", () => {
    it("includes row number, original record, errors, and suggested corrections", () => {
      const records = [
        { ...validRecord, alarm_id: "" },
      ];
      const result = validateDataset(records);
      expect(result.invalidRows).toHaveLength(1);
      const qRow = result.invalidRows[0];
      expect(qRow.rowIndex).toBe(1);
      expect(qRow.originalRecord.alarm_id).toBe("");
      expect(qRow.errors).toHaveLength(1);
      expect(qRow.errors[0].suggestedCorrection).toBeDefined();
      expect(qRow.errors[0].suggestedCorrection).toContain("alarm identifier");
    });
  });

  describe("source row tracing", () => {
    it("keeps _sourceRowIndex on valid rows for traceability", () => {
      const records = [
        { ...validRecord, alarm_id: "" },
        { ...validRecord, alarm_id: "ALM-2" },
      ];
      const { validRecords } = gateForDownstreamBots(records);
      expect(validRecords).toHaveLength(1);
      // _sourceRowIndex should point to row 2 (the valid one)
      expect((validRecords[0] as any)._sourceRowIndex).toBe(2);
    });
  });
});
