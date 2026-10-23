import type { Severity } from "@/lib/types";

export interface RootCauseInput {
  alarm_code: string;
  vibration_mm_s: number | null;
  temperature_c: number | null;
  hydraulic_pressure_bar: number | null;
  recurrence?: number;
  severity?: Severity;
  duration_min?: number;
  estimated_power_kw?: number | null;
}

export interface RootCauseSuggestion {
  cause: string;
  evidence: string;
  action: string;
  confidence: number;
}

export interface RiskResult {
  score: number;
  category: "Low" | "Medium" | "High";
}

export interface PriorityWeights {
  severity: number;
  recurrence: number;
  duration: number;
  impact: number;
}

export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  severity: 45,
  recurrence: 25,
  duration: 15,
  impact: 15,
};

const SEVERITY_RISK: Record<Severity, number> = {
  Low: 8,
  Medium: 22,
  High: 40,
  Critical: 58,
};

const SEVERITY_PRIORITY: Record<Severity, number> = {
  Low: 8,
  Medium: 22,
  High: 40,
  Critical: 58,
};

function numeric(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function suggestRootCause(alarm: RootCauseInput): RootCauseSuggestion {
  const code = alarm.alarm_code.toUpperCase();
  const vibration = numeric(alarm.vibration_mm_s);
  const temperature = numeric(alarm.temperature_c);
  const pressure = numeric(alarm.hydraulic_pressure_bar, 170);
  const recurrence = Math.max(1, Math.round(alarm.recurrence ?? 1));

  if (code.startsWith("VIB") || vibration > 8) {
    return {
      cause: "Drivetrain bearing, gearbox, or rotor imbalance",
      evidence: `Vibration is ${vibration.toFixed(1)} mm/s; ${recurrence} matching alarm(s) on this turbine.`,
      action: "Inspect bearing condition, gearbox oil/debris, alignment, and rotor balance.",
      confidence: 86,
    };
  }

  if (code.startsWith("TMP") || temperature > 85) {
    return {
      cause: "Cooling, lubrication, or gearbox thermal issue",
      evidence: `Temperature is ${temperature.toFixed(1)}°C; the thermal threshold rule matched.`,
      action: "Check oil level/quality, cooler flow, and temperature sensor calibration.",
      confidence: 79,
    };
  }

  if (code.startsWith("HYD") || pressure < 140 || pressure > 190) {
    return {
      cause: "Hydraulic system pressure or leak issue",
      evidence: `Hydraulic pressure is ${pressure.toFixed(0)} bar; the expected band is 140–190 bar.`,
      action: "Inspect hoses, filters, pump condition, and the pressure transducer.",
      confidence: 77,
    };
  }

  if (code.startsWith("COM")) {
    return {
      cause: "Sensor, network, or controller communication issue",
      evidence: `Communication alarm has recurred ${recurrence} time(s).`,
      action: "Inspect connector integrity, network switch logs, and controller diagnostics.",
      confidence: 72,
    };
  }

  return {
    cause: "Pitch actuator or related control-system issue",
    evidence: "Alarm code maps to the pitch-control rule set.",
    action: "Inspect actuator response, hydraulic supply, and position feedback.",
    confidence: 68,
  };
}

export function riskScore(
  alarm: RootCauseInput & { severity: Severity; duration_min: number },
): RiskResult {
  const recurrence = Math.max(1, Math.round(alarm.recurrence ?? 1));
  const duration = Math.max(0, alarm.duration_min ?? 0);
  const raw =
    SEVERITY_RISK[alarm.severity] +
    recurrence * 3 +
    (numeric(alarm.vibration_mm_s) > 8 ? 12 : 0) +
    (numeric(alarm.temperature_c) > 85 ? 10 : 0) +
    (duration > 90 ? 8 : 0);
  const score = Math.min(100, Math.max(0, Math.round(raw)));
  return {
    score,
    category: score <= 34 ? "Low" : score <= 64 ? "Medium" : "High",
  };
}

export function priorityScore(
  alarm: RootCauseInput & { severity: Severity; duration_min: number },
  weights: PriorityWeights = DEFAULT_PRIORITY_WEIGHTS,
): number {
  const recurrence = Math.max(1, Math.round(alarm.recurrence ?? 1));
  const duration = Math.max(0, alarm.duration_min ?? 0);
  const power = numeric(alarm.estimated_power_kw, 2500);
  const raw =
    (SEVERITY_PRIORITY[alarm.severity] / 58) * weights.severity +
    (Math.min(recurrence, 10) / 10) * weights.recurrence +
    (Math.min(duration, 240) / 240) * weights.duration +
    (Math.max(0, 3500 - power) / 3500) * weights.impact;
  const total = weights.severity + weights.recurrence + weights.duration + weights.impact;
  return Math.round((raw / Math.max(total, 1)) * 100);
}

export function formatMttr(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return "—";
  return `${hours.toFixed(1)} h`;
}
