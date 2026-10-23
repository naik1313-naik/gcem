export const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ALARM_STATUSES = ["Active", "Acknowledged", "Resolved"] as const;
export type AlarmStatus = (typeof ALARM_STATUSES)[number];

export const ALARM_SORTS = ["newest", "priority"] as const;
export type AlarmSort = (typeof ALARM_SORTS)[number];

export const INCIDENT_STATUSES = ["Open", "Assigned", "In Progress", "Resolved"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const TECHNICIANS = [
  "Unassigned",
  "Alex Morgan",
  "Priya Shah",
  "Jordan Lee",
  "Field Team A",
] as const;

export interface AlarmRecord {
  id: string;
  alarm_id: string;
  turbine_id: string;
  alarm_code: string;
  description: string;
  severity: Severity;
  timestamp: string;
  duration_min: number;
  status: AlarmStatus;
  vibration_mm_s: number | null;
  temperature_c: number | null;
  hydraulic_pressure_bar: number | null;
  estimated_power_kw: number | null;
  suggested_root_cause: string | null;
  confirmed_root_cause: string | null;
  technician: string | null;
  department_recommendation: string | null;
  department_confidence: number | null;
  department_is_provisional: boolean | null;
  department_review_status: string | null;
  resolution_notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface AlarmInsert {
  alarm_id: string;
  turbine_id: string;
  alarm_code: string;
  description: string;
  severity: Severity;
  timestamp: string;
  duration_min: number;
  status: AlarmStatus;
  vibration_mm_s: number;
  temperature_c: number;
  hydraulic_pressure_bar: number;
  estimated_power_kw: number;
  suggested_root_cause?: string;
  confirmed_root_cause?: string | null;
  technician?: string | null;
  department_recommendation?: string | null;
  department_confidence?: number | null;
  department_is_provisional?: boolean | null;
  department_review_status?: string | null;
  resolution_notes?: string | null;
  source?: string;
}

export interface AlarmFilters {
  turbine: string;
  severities: Severity[];
  statuses: AlarmStatus[];
  q: string;
  exactDate: string;
  from: string;
  to: string;
  sort: AlarmSort;
}

export interface Turbine {
  id: string;
  name: string;
  site: string | null;
  model: string | null;
  capacity_kw: number;
}

export interface MaintenanceIncident {
  id: string;
  alarm_id: string | null;
  turbine_id: string;
  title: string;
  technician: string;
  priority: Severity;
  due_date: string | null;
  status: IncidentStatus;
  notes: string | null;
  resolution_summary: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  alarm_history?: {
    alarm_code: string;
    description: string;
    severity: Severity;
  } | null;
}

export interface ActionState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

export interface CsvRowError {
  row: number;
  message: string;
}

export interface CsvDuplicate {
  row: number;
  alarmId: string;
  reason: string;
}

export interface ImportSummary {
  totalRows: number;
  validRows: number;
  importedRows: number;
  duplicateRows: number;
  invalidRows: number;
  errors: CsvRowError[];
  duplicates: CsvDuplicate[];
  fatalError?: string;
}

export interface ImportActionState {
  ok: boolean;
  message: string;
  summary?: ImportSummary;
}
