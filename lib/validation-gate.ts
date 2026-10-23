/**
 * WindSage AI — Data Validation Gate (TypeScript)
 *
 * Ensures invalid data is skipped and only valid data proceeds to
 * downstream bots (recurrence, sensor/anomaly, department classification).
 *
 * Invalid rows are quarantined with row number, reason, and recommended
 * correction. Valid rows keep a sourceRowIndex so they can be traced back
 * to the original upload.
 *
 * This mirrors the Python validation_gate.py so frontend and backend
 * validation stay consistent.
 */

import type { AlarmInsert } from "@/lib/types";

export const VALID_SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
export const VALID_STATUSES = ["Active", "Acknowledged", "Resolved", "In Progress", "Open"] as const;

export interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
  value: unknown;
  suggestedCorrection?: string;
}

export interface QuarantinedRow {
  rowIndex: number;
  originalRecord: Record<string, unknown>;
  errors: ValidationError[];
}

export interface MissingValueCounts {
  alarm_id: number;
  turbine_id: number;
  alarm_code: number;
  description: number;
  severity: number;
  status: number;
  timestamp: number;
  duration_min: number;
  vibration_mm_s: number;
  temperature_c: number;
  hydraulic_pressure_bar: number;
  estimated_power_kw: number;
}

export interface ValidationResult {
  validRows: AlarmInsert[];
  invalidRows: QuarantinedRow[];
  errors: ValidationError[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
  missingValues: MissingValueCounts;
  errorsByReason: Record<string, number>;
}

export interface ValidationSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  missingValueTotal: number;
  errorsByReason: Record<string, number>;
  modules: Record<string, { recordsUsed: number; status: "ok" | "skipped" | "error" }>;
}

const REQUIRED_FIELDS = [
  "alarm_id",
  "turbine_id",
  "alarm_code",
  "description",
  "severity",
  "status",
  "timestamp",
  "duration_min",
] as const;

const OPTIONAL_SENSOR_FIELDS = [
  "vibration_mm_s",
  "temperature_c",
  "hydraulic_pressure_bar",
  "estimated_power_kw",
] as const;

const SENSOR_RANGES: Record<string, { min: number; max: number }> = {
  vibration_mm_s: { min: 0, max: 100 },
  temperature_c: { min: -50, max: 200 },
  hydraulic_pressure_bar: { min: 0, max: 500 },
  estimated_power_kw: { min: 0, max: 10_000 },
};

// Severity normalization (case-insensitive variant handling)
const SEVERITY_NORMALIZATION: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

// Status normalization (case-insensitive variant handling)
const STATUS_NORMALIZATION: Record<string, string> = {
  open: "Open",
  resolved: "Resolved",
  acknowledged: "Acknowledged",
  "in progress": "In Progress",
  "in_progress": "In Progress",
  "in-progress": "In Progress",
  active: "Active",
};

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function isValidAlarmId(value: unknown): boolean {
  const s = String(value ?? "").trim();
  return s.length >= 3 && s.length <= 64 && /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/.test(s);
}

function isValidTurbineId(value: unknown): boolean {
  const s = String(value ?? "").trim();
  return s.length >= 3 && s.length <= 32 && /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(s);
}

function isValidAlarmCode(value: unknown): boolean {
  const s = String(value ?? "").trim();
  return s.length >= 3 && s.length <= 32 && /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(s);
}

function isValidTimestamp(value: unknown): boolean {
  if (isMissing(value)) return false;
  const normalized = String(value).includes(" ")
    ? String(value).replace(" ", "T")
    : String(value);
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const candidate = hasZone ? normalized : `${normalized}Z`;
  return !Number.isNaN(new Date(candidate).getTime());
}

function isValidDuration(value: unknown): boolean {
  if (isMissing(value)) return false;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 && num <= 10_000;
}

function suggestedCorrectionFor(field: string, value: unknown): string | undefined {
  switch (field) {
    case "alarm_id":
      return "Provide a unique alarm identifier (3–64 chars, letters/numbers/_/-).";
    case "turbine_id":
      return "Provide a turbine identifier (3–32 chars, letters/numbers/_/-).";
    case "alarm_code":
      return "Provide an alarm code (3–32 chars, letters/numbers/_/-).";
    case "description":
      return "Provide a description of the alarm (1–500 chars).";
    case "severity":
      return "Use one of: Critical, High, Medium, Low.";
    case "status":
      return "Use one of: Active, Acknowledged, Resolved.";
    case "timestamp":
      return "Provide a valid ISO 8601 timestamp, e.g. 2026-10-20T06:15:00Z.";
    case "duration_min":
      return "Provide a number between 0 and 10000.";
    case "vibration_mm_s":
      return "Provide a number between 0 and 100.";
    case "temperature_c":
      return "Provide a number between -50 and 200.";
    case "hydraulic_pressure_bar":
      return "Provide a number between 0 and 500.";
    case "estimated_power_kw":
      return "Provide a number between 0 and 10000.";
    default:
      return undefined;
  }
}

export function validateRecord(
  record: Record<string, unknown>,
  rowIndex: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // --- Required fields ---
  if (isMissing(record.alarm_id)) {
    errors.push({
      rowIndex,
      field: "alarm_id",
      message: "alarm_id is required.",
      value: record.alarm_id,
      suggestedCorrection: suggestedCorrectionFor("alarm_id", record.alarm_id),
    });
  } else if (!isValidAlarmId(record.alarm_id)) {
    errors.push({
      rowIndex,
      field: "alarm_id",
      message: "alarm_id must be 3–64 characters (letters, numbers, _ or -).",
      value: record.alarm_id,
      suggestedCorrection: suggestedCorrectionFor("alarm_id", record.alarm_id),
    });
  }
  if (isMissing(record.turbine_id)) {
    errors.push({
      rowIndex,
      field: "turbine_id",
      message: "turbine_id is required.",
      value: record.turbine_id,
      suggestedCorrection: suggestedCorrectionFor("turbine_id", record.turbine_id),
    });
  } else if (!isValidTurbineId(record.turbine_id)) {
    errors.push({
      rowIndex,
      field: "turbine_id",
      message: "turbine_id must be 3–32 characters (letters, numbers, _ or -).",
      value: record.turbine_id,
      suggestedCorrection: suggestedCorrectionFor("turbine_id", record.turbine_id),
    });
  }
  if (isMissing(record.alarm_code)) {
    errors.push({
      rowIndex,
      field: "alarm_code",
      message: "alarm_code is required.",
      value: record.alarm_code,
      suggestedCorrection: suggestedCorrectionFor("alarm_code", record.alarm_code),
    });
  } else if (!isValidAlarmCode(record.alarm_code)) {
    errors.push({
      rowIndex,
      field: "alarm_code",
      message: "alarm_code must be 3–32 characters (letters, numbers, _ or -).",
      value: record.alarm_code,
      suggestedCorrection: suggestedCorrectionFor("alarm_code", record.alarm_code),
    });
  }
  const desc = String(record.description ?? "").trim();
  if (!desc) {
    errors.push({
      rowIndex,
      field: "description",
      message: "description is required.",
      value: record.description,
      suggestedCorrection: suggestedCorrectionFor("description", record.description),
    });
  } else if (desc.length > 500) {
    errors.push({
      rowIndex,
      field: "description",
      message: "description must be 500 characters or fewer.",
      value: record.description,
      suggestedCorrection: suggestedCorrectionFor("description", record.description),
    });
  }

  // --- Enums (case-insensitive validation) ---
  const validSeveritiesLower = VALID_SEVERITIES.map(s => s.toLowerCase());
  const validStatusesLower = VALID_STATUSES.map(s => s.toLowerCase());
  const sevRaw = String(record.severity ?? "").trim().toLowerCase();
  if (!isMissing(record.severity) && !validSeveritiesLower.includes(sevRaw)) {
    errors.push({
      rowIndex,
      field: "severity",
      message: `severity must be one of ${VALID_SEVERITIES.join(", ")}.`,
      value: record.severity,
      suggestedCorrection: suggestedCorrectionFor("severity", record.severity),
    });
  }
  const statRaw = String(record.status ?? "").trim().toLowerCase();
  if (!isMissing(record.status) && !validStatusesLower.includes(statRaw)) {
    errors.push({
      rowIndex,
      field: "status",
      message: `status must be one of ${VALID_STATUSES.join(", ")}.`,
      value: record.status,
      suggestedCorrection: suggestedCorrectionFor("status", record.status),
    });
  }

  // --- Timestamp ---
  if (!isValidTimestamp(record.timestamp)) {
    errors.push({
      rowIndex,
      field: "timestamp",
      message: "timestamp must be a valid ISO 8601 date.",
      value: record.timestamp,
      suggestedCorrection: suggestedCorrectionFor("timestamp", record.timestamp),
    });
  }

  // --- Duration (optional — defaults to 0 if missing) ---
  if (!isMissing(record.duration_min)) {
    if (!isValidDuration(record.duration_min)) {
      errors.push({
        rowIndex,
        field: "duration_min",
        message: "duration_min must be a number between 0 and 10000.",
        value: record.duration_min,
        suggestedCorrection: suggestedCorrectionFor("duration_min", record.duration_min),
      });
    }
  }

  // --- Optional sensor ranges (only validate if present and non-empty) ---
  for (const [col, range] of Object.entries(SENSOR_RANGES)) {
    const val = record[col];
    if (!isMissing(val)) {
      const fval = Number(val);
      if (!Number.isFinite(fval)) {
        errors.push({
          rowIndex,
          field: col,
          message: `${col} must be a number.`,
          value: val,
          suggestedCorrection: suggestedCorrectionFor(col, val),
        });
      } else if (fval < range.min || fval > range.max) {
        errors.push({
          rowIndex,
          field: col,
          message: `${col} must be between ${range.min} and ${range.max}.`,
          value: val,
          suggestedCorrection: suggestedCorrectionFor(col, val),
        });
      }
    }
  }

  return errors;
}

function countMissingValues(records: Record<string, unknown>[]): MissingValueCounts {
  const counts: MissingValueCounts = {
    alarm_id: 0,
    turbine_id: 0,
    alarm_code: 0,
    description: 0,
    severity: 0,
    status: 0,
    timestamp: 0,
    duration_min: 0,
    vibration_mm_s: 0,
    temperature_c: 0,
    hydraulic_pressure_bar: 0,
    estimated_power_kw: 0,
  };

  for (const record of records) {
    for (const field of REQUIRED_FIELDS) {
      if (isMissing(record[field])) {
        counts[field as keyof MissingValueCounts] += 1;
      }
    }
    for (const field of OPTIONAL_SENSOR_FIELDS) {
      if (isMissing(record[field])) {
        counts[field as keyof MissingValueCounts] += 1;
      }
    }
  }

  return counts;
}

function groupErrorsByReason(errors: ValidationError[]): Record<string, number> {
  const grouped: Record<string, number> = {};
  for (const error of errors) {
    grouped[error.field] = (grouped[error.field] ?? 0) + 1;
  }
  return grouped;
}

export function validateDataset(
  records: Record<string, unknown>[],
): ValidationResult {
  const validRows: AlarmInsert[] = [];
  const invalidRows: QuarantinedRow[] = [];
  const errors: ValidationError[] = [];

  // Case-insensitive lookups for normalization
  const sevLookup: Record<string, string> = Object.fromEntries(
    VALID_SEVERITIES.map(s => [s.toLowerCase(), s])
  );
  const statLookup: Record<string, string> = Object.fromEntries(
    VALID_STATUSES.map(s => [s.toLowerCase(), s])
  );

  for (let idx = 0; idx < records.length; idx += 1) {
    const rowIndex = idx + 1; // 1-based for display
    const record = records[idx];
    const recordErrors = validateRecord(record, rowIndex);

    if (recordErrors.length > 0) {
      invalidRows.push({
        rowIndex,
        originalRecord: { ...record },
        errors: recordErrors,
      });
      errors.push(...recordErrors);
    } else {
      const ts = new Date(
        String(record.timestamp).includes(" ")
          ? String(record.timestamp).replace(" ", "T") + "Z"
          : String(record.timestamp),
      ).toISOString();

      validRows.push({
        alarm_id: String(record.alarm_id).trim(),
        turbine_id: String(record.turbine_id).trim(),
        alarm_code: String(record.alarm_code).trim(),
        description: String(record.description).trim(),
        severity: (sevLookup[String(record.severity ?? "").trim().toLowerCase()] ?? String(record.severity).trim()) as (typeof VALID_SEVERITIES)[number],
        status: (statLookup[String(record.status ?? "").trim().toLowerCase()] ?? String(record.status).trim()) as (typeof VALID_STATUSES)[number],
        timestamp: ts,
        duration_min: Number(record.duration_min ?? 0),
        vibration_mm_s: Number(record.vibration_mm_s ?? 0),
        temperature_c: Number(record.temperature_c ?? 0),
        hydraulic_pressure_bar: Number(record.hydraulic_pressure_bar ?? 170),
        estimated_power_kw: Number(record.estimated_power_kw ?? 2500),
        suggested_root_cause: String(record.suggested_root_cause ?? "Not available in dataset"),
        source: String(record.source ?? "csv"),
        // Source row index for traceability back to the original upload.
        // Stored as a non-standard property; downstream consumers should ignore it.
        _sourceRowIndex: rowIndex,
      } as unknown as AlarmInsert);
    }
  }

  const missingValues = countMissingValues(records);
  const errorsByReason = groupErrorsByReason(errors);

  return {
    validRows,
    invalidRows,
    errors,
    totalRows: records.length,
    validCount: validRows.length,
    invalidCount: invalidRows.length,
    missingValues,
    errorsByReason,
  };
}

/**
 * Compute a missing-value total across all fields.
 */
export function missingValueTotal(missingValues: MissingValueCounts): number {
  return Object.values(missingValues).reduce((sum, v) => sum + v, 0);
}

/**
 * Validation gate before downstream bots consume data.
 * Returns (validRecords, validationResult).
 * Only validRecords should be passed to recurrence, sensor/anomaly,
 * or department classification.
 */
export function gateForDownstreamBots(
  records: Record<string, unknown>[],
): { validRecords: AlarmInsert[]; result: ValidationResult } {
  const result = validateDataset(records);
  return { validRecords: result.validRows, result };
}

/**
 * Build a human-readable validation summary message.
 */
export function summaryMessage(result: ValidationResult): string {
  const mvTotal = missingValueTotal(result.missingValues);
  return (
    `Processed ${result.totalRows} row(s); ` +
    `${result.validCount} valid, ${result.invalidCount} invalid, ` +
    `${mvTotal} missing value(s).`
  );
}
