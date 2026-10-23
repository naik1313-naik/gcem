import type { Severity, AlarmStatus } from "@/lib/types";

export const TARGET_SCHEMA = {
  // Required fields
  alarm_id: { required: true, type: "string", description: "Unique alarm identifier" },
  timestamp: { required: true, type: "datetime", description: "Alarm timestamp (ISO 8601)" },
  turbine_id: { required: true, type: "string", description: "Turbine identifier" },
  alarm_code: { required: true, type: "string", description: "Alarm/error code" },
  description: { required: true, type: "string", description: "Alarm description" },
  severity: { required: true, type: "enum", options: ["Critical", "High", "Medium", "Low"], description: "Severity level" },
  duration_min: { required: true, type: "number", description: "Duration in minutes" },
  status: { required: true, type: "enum", options: ["Active", "Acknowledged", "Resolved"], description: "Alarm status" },

  // Optional sensor columns
  sensor_id: { required: false, type: "string", description: "Sensor identifier" },
  sensor_type: { required: false, type: "string", description: "Sensor type (vibration, temperature, pressure, etc.)" },
  sensor_location: { required: false, type: "string", description: "Physical sensor location on turbine" },
  vibration_mm_s: { required: false, type: "number", description: "Vibration reading (mm/s)" },
  temperature_c: { required: false, type: "number", description: "Temperature reading (°C)" },
  hydraulic_pressure_bar: { required: false, type: "number", description: "Hydraulic pressure (bar)" },
  estimated_power_kw: { required: false, type: "number", description: "Estimated power output (kW)" },

  // Optional additional fields
  suggested_root_cause: { required: false, type: "string", description: "Suggested root cause" },
  confirmed_root_cause: { required: false, type: "string", description: "Confirmed root cause" },
  technician: { required: false, type: "string", description: "Assigned technician" },
  resolution_notes: { required: false, type: "string", description: "Resolution notes" },
  source: { required: false, type: "string", description: "Data source" },
} as const;

export type TargetField = keyof typeof TARGET_SCHEMA;

export interface ColumnMapping {
  [targetField: string]: string | null; // source column name or null if not mapped
}

export interface MappingSuggestion {
  targetField: TargetField;
  sourceColumn: string;
  confidence: number; // 0-1
  reason: string;
}

export interface DatasetProfile {
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];
  dateRange: { min: string | null; max: string | null } | null;
  missingRequired: TargetField[];
  suggestedMappings: MappingSuggestion[];
}

// Common column name variations for auto-detection
const COLUMN_ALIASES: Record<TargetField, string[]> = {
  alarm_id: ["alarm_id", "alarmid", "id", "event_id", "eventid", "alarm_number", "alarmnumber"],
  timestamp: ["timestamp", "time", "datetime", "date_time", "date", "occurred_at", "occurredat", "created_at", "createdat"],
  turbine_id: ["turbine_id", "turbineid", "turbine", "wtg_id", "wtgid", "asset_id", "assetid", "unit_id", "unitid"],
  alarm_code: ["alarm_code", "alarmcode", "code", "error_code", "errorcode", "fault_code", "faultcode", "alarm_type", "alarmtype"],
  description: ["description", "desc", "message", "alarm_message", "alarmmessage", "details", "summary"],
  severity: ["severity", "level", "priority", "criticality", "sev"],
  duration_min: ["duration_min", "durationmin", "duration", "duration_minutes", "minutes", "dur"],
  status: ["status", "state", "condition", "alarm_status", "alarmstatus"],
  sensor_id: ["sensor_id", "sensorid", "sensor", "tag", "tag_name", "tagname", "point_id", "pointid"],
  sensor_type: ["sensor_type", "sensortype", "type", "measurement_type", "measurementtype"],
  sensor_location: ["sensor_location", "sensorlocation", "location", "position", "install_location", "installlocation"],
  vibration_mm_s: ["vibration_mm_s", "vibration", "vib", "vibration_mms", "vib_mm_s"],
  temperature_c: ["temperature_c", "temperature", "temp", "temp_c", "temperature_celsius"],
  hydraulic_pressure_bar: ["hydraulic_pressure_bar", "pressure", "hydraulic_pressure", "hyd_pressure", "press"],
  estimated_power_kw: ["estimated_power_kw", "power", "power_kw", "estimated_power", "output_kw", "power_output"],
  suggested_root_cause: ["suggested_root_cause", "root_cause", "cause", "suggested_cause", "probable_cause"],
  confirmed_root_cause: ["confirmed_root_cause", "confirmed_cause", "actual_cause", "root_cause_confirmed"],
  technician: ["technician", "tech", "assigned_to", "assignedto", "engineer", "operator"],
  resolution_notes: ["resolution_notes", "notes", "resolution", "comments", "resolution_summary"],
  source: ["source", "origin", "data_source", "datasource"],
};

interface MatchCandidate {
  sourceColumn: string;
  confidence: number;
  reason: string;
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function suggestMappings(headers: string[]): MappingSuggestion[] {
  const suggestions: MappingSuggestion[] = [];

  for (const [targetField, aliases] of Object.entries(COLUMN_ALIASES)) {
    let bestMatch: MatchCandidate | null = null;

    for (const header of headers) {
      const normHeader = normalizeHeader(header);
      let matchedThisHeader = false;

      // Exact match
      if (aliases.includes(normHeader)) {
        bestMatch = { sourceColumn: header, confidence: 1.0, reason: `Exact match for ${targetField}` };
        matchedThisHeader = true;
      }

      // Partial match
      if (!matchedThisHeader) {
        for (const alias of aliases) {
          if (normHeader.includes(alias) || alias.includes(normHeader)) {
            const confidence = 0.8;
            const currentBestConfidence = bestMatch?.confidence ?? 0;
            if (!bestMatch || confidence > currentBestConfidence) {
              bestMatch = { sourceColumn: header, confidence, reason: `Partial match (${alias})` };
            }
            matchedThisHeader = true;
          }
        }
      }

      // Fuzzy match for common patterns
      if (!matchedThisHeader) {
        const targetKeywords = targetField.split("_");
        const headerWords = normHeader.split("_");
        const overlap = targetKeywords.filter(k => headerWords.some(h => h.includes(k) || k.includes(h))).length;
        if (overlap > 0) {
          const confidence = 0.5 * (overlap / targetKeywords.length);
          const currentBest = bestMatch?.confidence ?? 0;
          if (!bestMatch || confidence > currentBest) {
            bestMatch = { sourceColumn: header, confidence, reason: `Keyword overlap (${overlap}/${targetKeywords.length})` };
          }
        }
      }
    }

    if (bestMatch) {
      suggestions.push({
        targetField: targetField as TargetField,
        sourceColumn: bestMatch.sourceColumn,
        confidence: bestMatch.confidence,
        reason: bestMatch.reason,
      });
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

export function profileDataset(
  records: Record<string, unknown>[],
  headers: string[]
): DatasetProfile {
  const sampleRows = records.slice(0, 5);
  const rowCount = records.length;

  // Detect date range from timestamp-like columns
  let dateRange: { min: string | null; max: string | null } | null = null;
  const timestampCandidates = headers.filter(h =>
    /time|date|timestamp/i.test(h)
  );

  if (timestampCandidates.length > 0) {
    const dates: Date[] = [];
    for (const record of records) {
      for (const col of timestampCandidates) {
        const val = record[col];
        if (val) {
          const parsed = new Date(String(val));
          if (!isNaN(parsed.getTime())) {
            dates.push(parsed);
          }
        }
      }
    }
    if (dates.length > 0) {
      dates.sort((a, b) => a.getTime() - b.getTime());
      dateRange = {
        min: dates[0].toISOString(),
        max: dates[dates.length - 1].toISOString(),
      };
    }
  }

  const suggestions = suggestMappings(headers);
  const mappedFields = new Set(suggestions.map(s => s.targetField));
  const missingRequired = (Object.keys(TARGET_SCHEMA) as TargetField[])
    .filter(f => TARGET_SCHEMA[f].required && !mappedFields.has(f));

  return {
    headers,
    rowCount,
    sampleRows,
    dateRange,
    missingRequired,
    suggestedMappings: suggestions,
  };
}

export function applyMapping(
  records: Record<string, unknown>[],
  mapping: ColumnMapping
): Record<string, unknown>[] {
  return records.map(record => {
    const mapped: Record<string, unknown> = {};
    for (const [targetField, sourceColumn] of Object.entries(mapping)) {
      if (sourceColumn && record[sourceColumn] !== undefined) {
        mapped[targetField] = record[sourceColumn];
      }
    }
    return mapped;
  });
}

export function validateMappedData(
  records: Record<string, unknown>[],
  mapping: ColumnMapping
): { valid: Record<string, unknown>[]; errors: { row: number; message: string }[] } {
  const valid: Record<string, unknown>[] = [];
  const errors: { row: number; message: string }[] = [];

  const requiredFields = (Object.keys(TARGET_SCHEMA) as TargetField[])
    .filter(f => TARGET_SCHEMA[f].required);

  records.forEach((record, index) => {
    const rowNum = index + 1;
    const rowErrors: string[] = [];

    for (const field of requiredFields) {
      const sourceCol = mapping[field];
      if (!sourceCol) {
        rowErrors.push(`Required field '${field}' not mapped`);
        continue;
      }
      const value = record[sourceCol];
      if (value === undefined || value === null || String(value).trim() === "") {
        rowErrors.push(`Required field '${field}' (mapped from '${sourceCol}') is empty`);
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, message: rowErrors.join("; ") });
    } else {
      // Apply mapping to create normalized record
      const mapped: Record<string, unknown> = {};
      for (const [targetField, sourceColumn] of Object.entries(mapping)) {
        if (sourceColumn && record[sourceColumn] !== undefined) {
          mapped[targetField] = record[sourceColumn];
        }
      }
      valid.push(mapped);
    }
  });

  return { valid, errors };
}