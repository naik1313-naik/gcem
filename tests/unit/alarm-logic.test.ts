import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRIORITY_WEIGHTS,
  priorityScore,
  riskScore,
  suggestRootCause,
} from "@/lib/alarm-logic";

const base = {
  alarm_code: "VIB-201",
  vibration_mm_s: 4.2,
  temperature_c: 70,
  hydraulic_pressure_bar: 170,
  recurrence: 1,
  severity: "Medium" as const,
  duration_min: 30,
  estimated_power_kw: 2500,
};

describe("root-cause suggestions", () => {
  it("suggests a drivetrain cause for vibration alarms", () => {
    const result = suggestRootCause({ ...base, vibration_mm_s: 9.4 });
    expect(result.cause).toContain("Drivetrain");
    expect(result.evidence).toContain("9.4 mm/s");
    expect(result.confidence).toBe(86);
  });

  it("suggests a thermal cause for temperature alarms", () => {
    const result = suggestRootCause({ ...base, alarm_code: "TMP-310", temperature_c: 94 });
    expect(result.cause).toContain("thermal");
  });

  it("suggests a hydraulic cause when pressure is outside the band", () => {
    const result = suggestRootCause({ ...base, alarm_code: "HYD-410", hydraulic_pressure_bar: 118 });
    expect(result.cause).toContain("Hydraulic");
    expect(result.evidence).toContain("140–190 bar");
  });

  it("suggests a communications cause for COM alarms", () => {
    const result = suggestRootCause({ ...base, alarm_code: "COM-101", recurrence: 4 });
    expect(result.cause).toContain("communication");
    expect(result.evidence).toContain("4 time(s)");
  });

  it("falls through to the pitch-control rule", () => {
    const result = suggestRootCause({ ...base, alarm_code: "PIT-220" });
    expect(result.cause).toContain("Pitch actuator");
    expect(result.confidence).toBe(68);
  });
});

describe("risk scoring", () => {
  it("classifies a low-risk alarm", () => {
    const result = riskScore({ ...base, severity: "Low", duration_min: 10 });
    expect(result.score).toBe(11);
    expect(result.category).toBe("Low");
  });

  it("classifies a medium-risk alarm", () => {
    const result = riskScore({ ...base, recurrence: 2, temperature_c: 90, duration_min: 100 });
    expect(result.score).toBe(46);
    expect(result.category).toBe("Medium");
  });

  it("clamps high-risk scores at 100", () => {
    const result = riskScore({
      ...base,
      severity: "Critical",
      recurrence: 10,
      vibration_mm_s: 12,
      temperature_c: 95,
      duration_min: 200,
    });
    expect(result.score).toBe(100);
    expect(result.category).toBe("High");
  });
});

describe("priority scoring", () => {
  it("computes the default weighted priority", () => {
    expect(
      priorityScore({
        ...base,
        severity: "Critical",
        recurrence: 2,
        duration_min: 60,
        estimated_power_kw: 2000,
      }),
    ).toBe(60);
  });

  it("normalizes custom weights to 100", () => {
    expect(
      priorityScore(
        { ...base, severity: "Critical" },
        { severity: 100, recurrence: 0, duration: 0, impact: 0 },
      ),
    ).toBe(100);
  });

  it("returns zero when every weight is zero", () => {
    expect(
      priorityScore(base, { severity: 0, recurrence: 0, duration: 0, impact: 0 }),
    ).toBe(0);
  });

  it("exposes default weights that total 100", () => {
    const total = Object.values(DEFAULT_PRIORITY_WEIGHTS).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(100);
  });
});
