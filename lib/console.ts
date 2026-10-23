import { priorityScore, riskScore, suggestRootCause } from "@/lib/alarm-logic";
import type { AlarmRecord, MaintenanceIncident, Severity } from "@/lib/types";

export interface ConsoleCategory {
  id: string;
  label: string;
  team: string;
}

export const CONSOLE_CATEGORIES: ConsoleCategory[] = [
  { id: "drivetrain", label: "Drivetrain", team: "Mechanical" },
  { id: "temperature", label: "Temperature", team: "Mechanical" },
  { id: "hydraulic", label: "Hydraulic", team: "Mechanical" },
  { id: "controls", label: "Controls / SCADA", team: "SCADA / Controls" },
  { id: "pitch", label: "Pitch system", team: "Electrical" },
  { id: "other", label: "Other", team: "Operations" },
];

const CATEGORY_BY_CODE: Record<string, ConsoleCategory> = {
  "VIB-201": CONSOLE_CATEGORIES[0],
  "TMP-310": CONSOLE_CATEGORIES[1],
  "HYD-410": CONSOLE_CATEGORIES[2],
  "COM-101": CONSOLE_CATEGORIES[3],
  "PIT-220": CONSOLE_CATEGORIES[4],
};

const CATEGORY_BY_ID = new Map(CONSOLE_CATEGORIES.map((category) => [category.id, category]));

export const SLA_HOURS: Record<Severity, number> = {
  Critical: 24,
  High: 72,
  Medium: 168,
  Low: 336,
};

export type WorkflowStatus = "New" | "Assigned" | "In progress" | "Resolved" | "Closed";
export type PriorityRank = "P1" | "P2" | "P3";

export interface RecurrenceGroup {
  key: string;
  turbine: string;
  category: string;
  categoryLabel: string;
  team: string;
  topCode: string;
  count: number;
  active: number;
  open: number;
  lastAt: number;
  avgGap: number;
  loss: number;
  last30: number;
  prev30: number;
  trend: "up" | "down" | "flat";
}

export interface ConsoleStats {
  open: number;
  active: number;
  awaiting: number;
  criticalOpen: number;
  overdue: number;
  criticalOverdue: number;
  loss30: number;
  lpf30: number;
  mttr: number | null;
  mttrCount: number;
  recurring: number;
  recurringOpen: number;
}

export function categoryForAlarm(alarm: Pick<AlarmRecord, "alarm_code">): ConsoleCategory {
  return CATEGORY_BY_CODE[alarm.alarm_code] ?? CONSOLE_CATEGORIES[5];
}

export function categoryForId(id: string): ConsoleCategory {
  return CATEGORY_BY_ID.get(id) ?? CONSOLE_CATEGORIES[5];
}

export function severityClass(severity: Severity): string {
  if (severity === "Critical") return "critical";
  if (severity === "High") return "major";
  return "minor";
}

export function statusClass(status: WorkflowStatus): string {
  if (status === "New") return "new";
  if (status === "Assigned") return "assigned";
  if (status === "In progress") return "progress";
  if (status === "Resolved") return "resolved";
  return "closed";
}

export function incidentForAlarm(
  incidents: MaintenanceIncident[],
  alarmId: string,
): MaintenanceIncident | null {
  return (
    incidents.find((incident) => incident.alarm_id === alarmId && incident.status !== "Resolved") ??
    incidents.find((incident) => incident.alarm_id === alarmId) ??
    null
  );
}

export function workflowStatus(
  alarm: AlarmRecord,
  incident: MaintenanceIncident | null,
): WorkflowStatus {
  if (alarm.status === "Resolved") return "Resolved";
  if (incident) {
    if (incident.status === "Resolved") return "Resolved";
    if (incident.status === "In Progress") return "In progress";
    if (incident.status === "Assigned") return "Assigned";
  }
  if (alarm.status === "Acknowledged") return "In progress";
  if (alarm.technician) return "Assigned";
  return "New";
}

export function ownerForAlarm(
  alarm: AlarmRecord,
  incident: MaintenanceIncident | null,
): string | null {
  const owner = incident?.technician ?? alarm.technician;
  return owner && owner !== "Unassigned" ? owner : null;
}

export function teamForAlarm(alarm: AlarmRecord): string {
  return categoryForAlarm(alarm).team;
}

export function downtimeHours(alarm: AlarmRecord): number {
  return Math.max(0, alarm.duration_min) / 60;
}

export function estimatedMwh(alarm: AlarmRecord): number {
  const power = alarm.estimated_power_kw ?? 2500;
  return (downtimeHours(alarm) * power) / 1000;
}

export function priorityForAlarm(
  alarm: AlarmRecord,
  recurrence = 1,
): { score: number; rank: PriorityRank } {
  const score = priorityScore({ ...alarm, recurrence });
  return { score, rank: score >= 75 ? "P1" : score >= 45 ? "P2" : "P3" };
}

export function recurrenceForAlarm(alarm: AlarmRecord, alarms: AlarmRecord[]): number {
  return alarms.filter(
    (item) => item.turbine_id === alarm.turbine_id && item.alarm_code === alarm.alarm_code,
  ).length;
}

export interface RecurrenceByCode {
  turbine_id: string;
  alarm_code: string;
  alarm_description: string;
  total_occurrences: number;
  first_occurrence: string;
  last_occurrence: string;
  occurrences_24h: number;
  occurrences_7d: number;
  occurrences_30d: number;
  mean_interval_h: number | null;
  median_interval_h: number | null;
  min_interval_h: number | null;
  max_interval_h: number | null;
  burst_flag: boolean;
}

export function recurrenceByTurbineAndCode(
  alarms: AlarmRecord[],
  now: number = Date.now(),
): RecurrenceByCode[] {
  const groups = new Map<string, { items: AlarmRecord[]; description: string }>();

  alarms.forEach((alarm) => {
    const key = `${alarm.turbine_id}|${alarm.alarm_code}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(alarm);
    } else {
      groups.set(key, { items: [alarm], description: alarm.description });
    }
  });

  const results: RecurrenceByCode[] = [];
  const ms24h = 24 * 60 * 60 * 1000;
  const ms7d = 7 * 24 * 60 * 60 * 1000;
  const ms30d = 30 * 24 * 60 * 60 * 1000;

  groups.forEach(({ items, description }, key) => {
    const [turbine_id, alarm_code] = key.split("|");
    const sorted = [...items].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const total = sorted.length;

    const nowMs = now;
    const occ24h = sorted.filter(
      (a) => nowMs - new Date(a.timestamp).getTime() <= ms24h,
    ).length;
    const occ7d = sorted.filter(
      (a) => nowMs - new Date(a.timestamp).getTime() <= ms7d,
    ).length;
    const occ30d = sorted.filter(
      (a) => nowMs - new Date(a.timestamp).getTime() <= ms30d,
    ).length;

    // Intervals
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      intervals.push(
        (new Date(sorted[i].timestamp).getTime() -
          new Date(sorted[i - 1].timestamp).getTime()) /
          (60 * 60 * 1000),
      );
    }
    const meanInterval = intervals.length
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length
      : null;
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const medianInterval = intervals.length
      ? sortedIntervals[Math.floor(sortedIntervals.length / 2)]
      : null;
    const minInterval = intervals.length ? Math.min(...intervals) : null;
    const maxInterval = intervals.length ? Math.max(...intervals) : null;

    // Burst flag: >=3 events within 48h rolling window
    let burstFlag = false;
    if (total >= 3) {
      const times = sorted.map((a) => new Date(a.timestamp).getTime());
      const ms48h = 48 * 60 * 60 * 1000;
      for (let i = 0; i < times.length - 2; i += 1) {
        const windowEnd = times[i] + ms48h;
        const count = times.filter((t) => t >= times[i] && t <= windowEnd).length;
        if (count >= 3) {
          burstFlag = true;
          break;
        }
      }
    }

    results.push({
      turbine_id,
      alarm_code,
      alarm_description: description,
      total_occurrences: total,
      first_occurrence: first.timestamp,
      last_occurrence: last.timestamp,
      occurrences_24h: occ24h,
      occurrences_7d: occ7d,
      occurrences_30d: occ30d,
      mean_interval_h: meanInterval ? Math.round(meanInterval * 100) / 100 : null,
      median_interval_h: medianInterval ? Math.round(medianInterval * 100) / 100 : null,
      min_interval_h: minInterval ? Math.round(minInterval * 100) / 100 : null,
      max_interval_h: maxInterval ? Math.round(maxInterval * 100) / 100 : null,
      burst_flag: burstFlag,
    });
  });

  return results.sort((a, b) => b.total_occurrences - a.total_occurrences);
}

export function recurrenceInRange(
  alarms: AlarmRecord[],
  turbineId: string,
  alarmCode: string,
  start: string,
  end: string,
): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  return alarms.filter(
    (a) =>
      a.turbine_id === turbineId &&
      a.alarm_code === alarmCode &&
      new Date(a.timestamp).getTime() >= startMs &&
      new Date(a.timestamp).getTime() <= endMs,
  ).length;
}

export function topRecurringAlarms(alarms: AlarmRecord[], n: number = 10): RecurrenceByCode[] {
  return recurrenceByTurbineAndCode(alarms).slice(0, n);
}

export function topRecurringTurbines(alarms: AlarmRecord[], n: number = 10): {
  turbine_id: string;
  total_alarms: number;
  unique_codes: number;
}[] {
  const byTurbine = new Map<string, { count: number; codes: Set<string> }>();
  alarms.forEach((alarm) => {
    const entry = byTurbine.get(alarm.turbine_id) ?? { count: 0, codes: new Set() };
    entry.count += 1;
    entry.codes.add(alarm.alarm_code);
    byTurbine.set(alarm.turbine_id, entry);
  });
  return [...byTurbine.entries()]
    .map(([turbine_id, data]) => ({
      turbine_id,
      total_alarms: data.count,
      unique_codes: data.codes.size,
    }))
    .sort((a, b) => b.total_alarms - a.total_alarms)
    .slice(0, n);
}

export function searchRecurrence(
  alarms: AlarmRecord[],
  query: string,
): RecurrenceByCode[] {
  const q = query.toLowerCase();
  return recurrenceByTurbineAndCode(alarms).filter(
    (r) =>
      r.turbine_id.toLowerCase().includes(q) ||
      r.alarm_code.toLowerCase().includes(q) ||
      r.alarm_description.toLowerCase().includes(q),
  );
}

/* ─────────────────────────────────────────────────────────────
   Department Classification (provisional rule-based mappings)
   No verified department labels exist in the dataset, so all
   recommendations are marked provisional and route to Human Review.
   ───────────────────────────────────────────────────────────── */

export type Department =
  | "Electrical Engineering"
  | "Mechanical Engineering"
  | "Controls/Software Engineering"
  | "Instrumentation Engineering"
  | "Unknown / Human Review";

export interface DepartmentRecommendation {
  alarm_code: string;
  alarm_description: string;
  recommended_department: Department;
  confidence: number;
  is_provisional: boolean;
  evidence: string;
  review_status: "pending" | "accepted" | "overridden";
  override_department?: Department | null;
  override_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

const ALARM_CODE_DEPARTMENT_MAP: Record<string, {
  department: Department;
  confidence: number;
  evidence: string;
}> = {
  "VIB-201": {
    department: "Mechanical Engineering",
    confidence: 0.85,
    evidence: "Vibration alarm on drivetrain — mechanical rotating equipment issue.",
  },
  "TMP-310": {
    department: "Mechanical Engineering",
    confidence: 0.80,
    evidence: "Gearbox oil temperature high — mechanical thermal/lubrication issue.",
  },
  "HYD-410": {
    department: "Mechanical Engineering",
    confidence: 0.85,
    evidence: "Hydraulic pressure outside band — mechanical fluid power system issue.",
  },
  "PIT-220": {
    department: "Electrical Engineering",
    confidence: 0.80,
    evidence: "Pitch actuator response slow — electrical actuator/motor control issue.",
  },
  "COM-101": {
    department: "Controls/Software Engineering",
    confidence: 0.90,
    evidence: "Controller communication timeout — SCADA/network communication issue.",
  },
};

export function recommendDepartment(
  alarm_code: string,
  alarm_description: string = "",
): DepartmentRecommendation {
  const codeUpper = alarm_code.toUpperCase().trim();

  if (codeUpper in ALARM_CODE_DEPARTMENT_MAP) {
    const mapping = ALARM_CODE_DEPARTMENT_MAP[codeUpper];
    return {
      alarm_code,
      alarm_description: alarm_description || mapping.evidence,
      recommended_department: mapping.department,
      confidence: mapping.confidence,
      is_provisional: true,
      evidence: mapping.evidence,
      review_status: "pending",
    };
  }

  // Fallback: keyword-based heuristic
  const descLower = alarm_description.toLowerCase();
  if (
    descLower.includes("vibration") ||
    descLower.includes("bearing") ||
    descLower.includes("gearbox") ||
    descLower.includes("rotor") ||
    descLower.includes("drivetrain")
  ) {
    return {
      alarm_code,
      alarm_description,
      recommended_department: "Mechanical Engineering",
      confidence: 0.60,
      is_provisional: true,
      evidence: "Description keywords suggest mechanical equipment issue.",
      review_status: "pending",
    };
  }
  if (
    descLower.includes("temperature") ||
    descLower.includes("thermal") ||
    descLower.includes("oil") ||
    descLower.includes("cooling") ||
    descLower.includes("heat")
  ) {
    return {
      alarm_code,
      alarm_description,
      recommended_department: "Mechanical Engineering",
      confidence: 0.55,
      is_provisional: true,
      evidence: "Description keywords suggest thermal/mechanical issue.",
      review_status: "pending",
    };
  }
  if (
    descLower.includes("pressure") ||
    descLower.includes("hydraulic") ||
    descLower.includes("leak") ||
    descLower.includes("pump") ||
    descLower.includes("flow")
  ) {
    return {
      alarm_code,
      alarm_description,
      recommended_department: "Mechanical Engineering",
      confidence: 0.55,
      is_provisional: true,
      evidence: "Description keywords suggest hydraulic/fluid system issue.",
      review_status: "pending",
    };
  }
  if (
    descLower.includes("communication") ||
    descLower.includes("network") ||
    descLower.includes("controller") ||
    descLower.includes("timeout") ||
    descLower.includes("scada")
  ) {
    return {
      alarm_code,
      alarm_description,
      recommended_department: "Controls/Software Engineering",
      confidence: 0.60,
      is_provisional: true,
      evidence: "Description keywords suggest communication/control issue.",
      review_status: "pending",
    };
  }
  if (
    descLower.includes("pitch") ||
    descLower.includes("actuator") ||
    descLower.includes("motor") ||
    descLower.includes("electrical") ||
    descLower.includes("power")
  ) {
    return {
      alarm_code,
      alarm_description,
      recommended_department: "Electrical Engineering",
      confidence: 0.55,
      is_provisional: true,
      evidence: "Description keywords suggest electrical/actuator issue.",
      review_status: "pending",
    };
  }
  if (
    descLower.includes("sensor") ||
    descLower.includes("transducer") ||
    descLower.includes("instrument") ||
    descLower.includes("reading") ||
    descLower.includes("gauge")
  ) {
    return {
      alarm_code,
      alarm_description,
      recommended_department: "Instrumentation Engineering",
      confidence: 0.55,
      is_provisional: true,
      evidence: "Description keywords suggest instrumentation/sensor issue.",
      review_status: "pending",
    };
  }

  return {
    alarm_code,
    alarm_description,
    recommended_department: "Unknown / Human Review",
    confidence: 0.0,
    is_provisional: true,
    evidence: "No documented mapping or keyword match found. Requires human review.",
    review_status: "pending",
  };
}

export function getAllDepartmentMappings(): {
  alarm_code: string;
  department: Department;
  confidence: number;
  evidence: string;
  is_provisional: boolean;
}[] {
  return Object.entries(ALARM_CODE_DEPARTMENT_MAP).map(([code, mapping]) => ({
    alarm_code: code,
    department: mapping.department,
    confidence: mapping.confidence,
    evidence: mapping.evidence,
    is_provisional: true,
  }));
}

export function slaDeadline(alarm: AlarmRecord): number {
  return new Date(alarm.timestamp).getTime() + SLA_HOURS[alarm.severity] * 3_600_000;
}

export function alarmDeadline(
  alarm: AlarmRecord,
  incident: MaintenanceIncident | null,
): number {
  if (incident?.due_date) {
    const endOfDay = new Date(`${incident.due_date}T23:59:59Z`).getTime();
    if (Number.isFinite(endOfDay)) return endOfDay;
  }
  return slaDeadline(alarm);
}

export function isOverdue(
  alarm: AlarmRecord,
  incident: MaintenanceIncident | null,
  now: number,
): boolean {
  if (workflowStatus(alarm, incident) === "Resolved" || alarm.status === "Resolved") return false;
  return alarmDeadline(alarm, incident) < now;
}

export function recurrenceGroups(alarms: AlarmRecord[], now = Date.now()): RecurrenceGroup[] {
  const windowStart = now - 60 * 86_400_000;
  const groups = new Map<string, { alarm: AlarmRecord; category: ConsoleCategory; items: AlarmRecord[] }>();

  alarms.forEach((alarm) => {
    const started = new Date(alarm.timestamp).getTime();
    if (!Number.isFinite(started) || started < windowStart) return;
    const category = categoryForAlarm(alarm);
    const key = `${alarm.turbine_id}|${category.id}`;
    const group = groups.get(key) ?? { alarm, category, items: [] };
    group.items.push(alarm);
    groups.set(key, group);
  });

  const output: RecurrenceGroup[] = [];
  groups.forEach((group, key) => {
    if (group.items.length < 3) return;
    const items = [...group.items].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const times = items.map((item) => new Date(item.timestamp).getTime());
    let gaps = 0;
    for (let index = 1; index < times.length; index += 1) {
      gaps += (times[index] - times[index - 1]) / 86_400_000;
    }
    const last30 = items.filter(
      (item) => new Date(item.timestamp).getTime() >= now - 30 * 86_400_000,
    ).length;
    const prev30 = items.filter((item) => {
      const time = new Date(item.timestamp).getTime();
      return time >= now - 60 * 86_400_000 && time < now - 30 * 86_400_000;
    }).length;
    const codeCounts = new Map<string, number>();
    items.forEach((item) => {
      codeCounts.set(item.alarm_code, (codeCounts.get(item.alarm_code) ?? 0) + 1);
    });
    const topCode = [...codeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const last = items[items.length - 1];

    output.push({
      key,
      turbine: last.turbine_id,
      category: group.category.id,
      categoryLabel: group.category.label,
      team: group.category.team,
      topCode,
      count: items.length,
      active: items.filter((item) => item.status !== "Resolved").length,
      open: items.filter((item) => item.status !== "Resolved").length,
      lastAt: new Date(last.timestamp).getTime(),
      avgGap: times.length > 1 ? gaps / (times.length - 1) : 0,
      loss: items.reduce((total, item) => total + estimatedMwh(item), 0),
      last30,
      prev30,
      trend: last30 > prev30 ? "up" : last30 < prev30 ? "down" : "flat",
    });
  });

  return output.sort((a, b) => b.loss - a.loss);
}

export function patternForAlarm(
  alarm: AlarmRecord,
  groups: RecurrenceGroup[],
): RecurrenceGroup | null {
  const category = categoryForAlarm(alarm);
  return (
    groups.find(
      (group) => group.turbine === alarm.turbine_id && group.category === category.id,
    ) ?? null
  );
}

export function patternAlarms(alarm: AlarmRecord, alarms: AlarmRecord[], now = Date.now()): AlarmRecord[] {
  const category = categoryForAlarm(alarm);
  const windowStart = now - 60 * 86_400_000;
  return alarms.filter((item) => {
    const time = new Date(item.timestamp).getTime();
    return (
      item.turbine_id === alarm.turbine_id &&
      categoryForAlarm(item).id === category.id &&
      time >= windowStart
    );
  });
}

export function categoryLoss(
  alarms: AlarmRecord[],
  now = Date.now(),
  days = 30,
): { id: string; label: string; team: string; count: number; loss: number }[] {
  const windowStart = now - days * 86_400_000;
  const rows = new Map<string, { id: string; label: string; team: string; count: number; loss: number }>();
  alarms.forEach((alarm) => {
    if (new Date(alarm.timestamp).getTime() < windowStart) return;
    const category = categoryForAlarm(alarm);
    const row = rows.get(category.id) ?? {
      id: category.id,
      label: category.label,
      team: category.team,
      count: 0,
      loss: 0,
    };
    row.count += 1;
    row.loss += estimatedMwh(alarm);
    rows.set(category.id, row);
  });
  return [...rows.values()].sort((a, b) => b.loss - a.loss);
}

export function consoleStats(
  alarms: AlarmRecord[],
  incidents: MaintenanceIncident[],
  now = Date.now(),
): ConsoleStats {
  const active = alarms.filter((alarm) => alarm.status !== "Resolved");
  const openIncidents = incidents.filter((incident) => incident.status !== "Resolved");
  const groups = recurrenceGroups(alarms, now);
  const last30 = alarms.filter(
    (alarm) => new Date(alarm.timestamp).getTime() >= now - 30 * 86_400_000,
  );
  const loss30 = last30.reduce((total, alarm) => total + estimatedMwh(alarm), 0);
  const fleetMw = new Set(alarms.map((alarm) => alarm.turbine_id)).size * 3.5;
  const potential30 = fleetMw * 0.38 * 720;
  const today = new Date(now).toISOString().slice(0, 10);
  const overdueIncidents = openIncidents.filter(
    (incident) => incident.due_date && incident.due_date < today,
  );
  const resolvedIncidents = incidents.filter(
    (incident) => incident.status === "Resolved" && incident.resolved_at,
  );
  const mttr = resolvedIncidents.length
    ? resolvedIncidents.reduce(
        (total, incident) =>
          total +
          Math.max(
            0,
            new Date(incident.resolved_at as string).getTime() -
              new Date(incident.created_at).getTime(),
          ) /
            3_600_000,
        0,
      ) / resolvedIncidents.length
    : null;

  return {
    open: active.length,
    active: active.length,
    awaiting: active.filter((alarm) => alarm.status === "Acknowledged").length,
    criticalOpen: active.filter((alarm) => alarm.severity === "Critical").length,
    overdue: overdueIncidents.length,
    criticalOverdue: overdueIncidents.filter((incident) => incident.priority === "Critical").length,
    loss30,
    lpf30: potential30 ? (loss30 / potential30) * 100 : 0,
    mttr,
    mttrCount: resolvedIncidents.length,
    recurring: groups.length,
    recurringOpen: groups.reduce((total, group) => total + group.active, 0),
  };
}

export function alarmInsight(alarm: AlarmRecord, alarms: AlarmRecord[], incidents: MaintenanceIncident[]) {
  const recurrence = recurrenceForAlarm(alarm, alarms);
  const suggestion = suggestRootCause({ ...alarm, recurrence });
  const priority = priorityForAlarm(alarm, recurrence);
  const risk = riskScore({ ...alarm, recurrence });
  const incident = incidentForAlarm(incidents, alarm.alarm_id);
  return { recurrence, suggestion, priority, risk, incident };
}

export function formatDate(timestamp: number | string | null | undefined): string {
  if (timestamp === null || timestamp === undefined || timestamp === "") return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}, ${date.toLocaleTimeString(
    "en-GB",
    { hour: "2-digit", minute: "2-digit", hour12: false },
  )}`;
}

export function formatDuration(minutes: number): string {
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  if (hours < 24) return `${hours}h ${String(remainder).padStart(2, "0")}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatMwh(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value >= 100 ? String(Math.round(value)) : value.toFixed(1);
}

export function formatClock(date: Date): string {
  const day = date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day} · ${time}`;
}
