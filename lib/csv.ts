import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import type {
  AlarmInsert,
  AlarmRecord,
  AlarmStatus,
  CsvDuplicate,
  CsvRowError,
  Severity,
} from "@/lib/types";
import { ALARM_STATUSES, SEVERITIES } from "@/lib/types";

export const REQUIRED_COLUMNS = [
  "alarm_id",
  "timestamp",
  "turbine_id",
  "alarm_code",
  "description",
  "severity",
  "duration_min",
  "status",
] as const;

export const SENSOR_COLUMNS = [
  "vibration_mm_s",
  "temperature_c",
  "hydraulic_pressure_bar",
  "estimated_power_kw",
] as const;

export const EXPORT_COLUMNS = [
  ...REQUIRED_COLUMNS,
  ...SENSOR_COLUMNS,
  "suggested_root_cause",
  "confirmed_root_cause",
  "technician",
  "resolution_notes",
  "source",
  "created_at",
];

export interface CsvParseResult {
  rows: AlarmInsert[];
  errors: CsvRowError[];
  duplicates: CsvDuplicate[];
  totalRows: number;
  missingHeaders: string[];
  fatalError?: string;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function parseNumber(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const normalized = raw.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimestamp(value: string): string | null {
  if (!value) return null;
  const normalized = value.includes(" ") ? value.replace(" ", "T") : value;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const candidate = hasZone ? normalized : `${normalized}Z`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeEnum<T extends string>(value: string, options: readonly T[]): T | null {
  return options.find((option) => option.toLowerCase() === value.toLowerCase()) ?? null;
}

interface ValidatedRow {
  alarm?: AlarmInsert;
  error?: string;
}

function validateRow(raw: Record<string, unknown>): ValidatedRow {
  const alarmId = text(raw.alarm_id);
  const turbineId = text(raw.turbine_id);
  const alarmCode = text(raw.alarm_code);
  const description = text(raw.description);
  const severity = normalizeEnum(text(raw.severity), SEVERITIES) as Severity | null;
  const status = normalizeEnum(text(raw.status), ALARM_STATUSES) as AlarmStatus | null;
  const timestamp = parseTimestamp(text(raw.timestamp));
  const duration = parseNumber(raw.duration_min);

  if (!alarmId) return { error: "alarm_id is required." };
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/.test(alarmId)) {
    return { error: "alarm_id must be 3–64 characters using letters, numbers, _ or -." };
  }
  if (!turbineId) return { error: "turbine_id is required." };
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(turbineId)) {
    return { error: "turbine_id must contain only letters, numbers, _ or -." };
  }
  if (!alarmCode) return { error: "alarm_code is required." };
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(alarmCode)) {
    return { error: "alarm_code must contain only letters, numbers, _ or -." };
  }
  if (!description) return { error: "description is required." };
  if (description.length > 500) return { error: "description must be 500 characters or fewer." };
  if (!severity) return { error: "severity must be Critical, High, Medium, or Low." };
  if (!timestamp) return { error: "timestamp must be a valid ISO date, for example 2026-10-20T06:15:00Z." };
  if (duration === null || duration < 0 || duration > 10_000) {
    return { error: "duration_min must be a number between 0 and 10000." };
  }
  if (!status) return { error: "status must be Active, Acknowledged, or Resolved." };

  const vibration = parseNumber(raw.vibration_mm_s) ?? 0;
  const temperature = parseNumber(raw.temperature_c) ?? 0;
  const pressure = parseNumber(raw.hydraulic_pressure_bar) ?? 170;
  const power = parseNumber(raw.estimated_power_kw) ?? 2500;

  if (vibration < 0 || vibration > 100) return { error: "vibration_mm_s must be between 0 and 100." };
  if (temperature < -50 || temperature > 200) return { error: "temperature_c must be between -50 and 200." };
  if (pressure < 0 || pressure > 500) return { error: "hydraulic_pressure_bar must be between 0 and 500." };
  if (power < 0 || power > 10_000) return { error: "estimated_power_kw must be between 0 and 10000." };

  return {
    alarm: {
      alarm_id: alarmId,
      turbine_id: turbineId,
      alarm_code: alarmCode,
      description,
      severity,
      timestamp,
      duration_min: duration,
      status,
      vibration_mm_s: vibration,
      temperature_c: temperature,
      hydraulic_pressure_bar: pressure,
      estimated_power_kw: power,
      source: "csv",
    },
  };
}

export function parseAlarmCsv(input: string): CsvParseResult {
  const empty: CsvParseResult = {
    rows: [],
    errors: [],
    duplicates: [],
    totalRows: 0,
    missingHeaders: [],
  };

  if (!input.trim()) return { ...empty, fatalError: "The CSV file is empty." };

  let records: Record<string, unknown>[];
  try {
    records = parse(input, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, unknown>[];
  } catch (error) {
    return {
      ...empty,
      fatalError: error instanceof Error ? `Could not parse CSV: ${error.message}` : "Could not parse CSV.",
    };
  }

  const headers = Object.keys(records[0] ?? {}).map((header) => header.trim());
  const missingHeaders = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missingHeaders.length) {
    return {
      ...empty,
      totalRows: records.length,
      missingHeaders,
      fatalError: `Missing required column(s): ${missingHeaders.join(", ")}.`,
    };
  }

  if (records.length > 1000) {
    return {
      ...empty,
      totalRows: records.length,
      fatalError: "CSV imports are limited to 1,000 data rows per file.",
    };
  }

  const rows: AlarmInsert[] = [];
  const errors: CsvRowError[] = [];
  const duplicates: CsvDuplicate[] = [];
  const seenIds = new Map<string, number>();
  const seenComposite = new Map<string, number>();

  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const validated = validateRow(record);
    if (!validated.alarm) {
      errors.push({ row: rowNumber, message: validated.error ?? "Invalid row." });
      return;
    }

    const alarm = validated.alarm;
    const previousIdRow = seenIds.get(alarm.alarm_id);
    if (previousIdRow) {
      duplicates.push({
        row: rowNumber,
        alarmId: alarm.alarm_id,
        reason: `Duplicate alarm_id already used on row ${previousIdRow}.`,
      });
      return;
    }

    const composite = `${alarm.turbine_id}|${alarm.timestamp}|${alarm.alarm_code}`;
    const previousCompositeRow = seenComposite.get(composite);
    if (previousCompositeRow) {
      duplicates.push({
        row: rowNumber,
        alarmId: alarm.alarm_id,
        reason: `Same turbine, timestamp, and alarm code as row ${previousCompositeRow}.`,
      });
      return;
    }

    seenIds.set(alarm.alarm_id, rowNumber);
    seenComposite.set(composite, rowNumber);
    rows.push(alarm);
  });

  return {
    rows,
    errors,
    duplicates,
    totalRows: records.length,
    missingHeaders,
  };
}

export function buildAlarmCsv(rows: Partial<AlarmRecord>[]): string {
  return stringify(rows, {
    header: true,
    columns: EXPORT_COLUMNS,
    cast: {
      boolean: (value) => String(value),
      // Prevent spreadsheet formula injection from user-supplied text fields.
      string: (value) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value),
    },
  });
}

export function alarmTemplateCsv(): string {
  const templateRow = {
    alarm_id: "ALM-TEMPLATE-001",
    timestamp: "2026-10-23T09:00:00Z",
    turbine_id: "WT-01",
    alarm_code: "VIB-201",
    description: "Drivetrain vibration above warning threshold",
    severity: "High",
    duration_min: 45,
    status: "Active",
    vibration_mm_s: 8.7,
    temperature_c: 74,
    hydraulic_pressure_bar: 168,
    estimated_power_kw: 2400,
  };
  return stringify([templateRow], { header: true, columns: [...EXPORT_COLUMNS] });
}
