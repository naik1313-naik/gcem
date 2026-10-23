import { prepareAlarmForInsert } from "@/lib/alarm-creation";
import { suggestRootCause } from "@/lib/alarm-logic";
import { recommendDepartment } from "@/lib/console";
import { resolveDateWindow, sanitizeSearchTerm } from "@/lib/filters";
import type {
  AlarmFilters,
  AlarmInsert,
  AlarmRecord,
  AlarmStatus,
  IncidentStatus,
  MaintenanceIncident,
  Severity,
  Turbine,
} from "@/lib/types";

export interface DemoAuditRecord {
  id: number;
  entity_type: string;
  entity_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  actor: string | null;
  changes: Record<string, unknown>;
  created_at: string;
}

interface DemoAssignment {
  id: string;
  incident_id: string;
  technician: string;
  assigned_at: string;
  unassigned_at: string | null;
  notes: string | null;
}

interface DemoStore {
  alarms: AlarmRecord[];
  incidents: MaintenanceIncident[];
  turbines: Turbine[];
  audit: DemoAuditRecord[];
  assignments: DemoAssignment[];
  nextAuditId: number;
  nextIncidentId: number;
}

export interface DemoImportResult {
  imported: number;
  duplicates: { alarmId: string; reason: string }[];
}

export interface DemoIncidentInput {
  alarm_id: string;
  turbine_id: string;
  title: string;
  technician: string;
  priority: Severity;
  due_date: string | null;
  notes: string | null;
}

export interface DemoIncidentUpdate {
  status: IncidentStatus;
  technician: string;
  priority: Severity;
  due_date: string | null;
  notes: string | null;
  resolution_summary: string | null;
}

const globalForDemo = globalThis as unknown as { __windsageDemoStore?: DemoStore };

const TURBINES: Turbine[] = [
  ["WT-01", "North Ridge"],
  ["WT-02", "North Ridge"],
  ["WT-03", "North Ridge"],
  ["WT-04", "North Ridge"],
  ["WT-05", "South Mesa"],
  ["WT-06", "South Mesa"],
  ["WT-07", "South Mesa"],
  ["WT-08", "East Point"],
  ["WT-09", "East Point"],
  ["WT-10", "East Point"],
].map(([id, site]) => ({
  id,
  name: `Turbine ${id.slice(3)}`,
  site,
  model: "WS-3.5",
  capacity_kw: 3500,
}));

function sampleAlarms(): AlarmRecord[] {
  const rows: [
    string,
    string,
    string,
    string,
    string,
    Severity,
    number,
    AlarmStatus,
    number,
    number,
    number,
    number,
  ][] = [
    [
      "ALM-1001",
      "WT-03",
      "VIB-201",
      "Drivetrain vibration above warning threshold",
      "2026-10-20T06:15:00.000Z",
      "Critical",
      190,
      "Active",
      11.4,
      79,
      165,
      1800,
    ],
    [
      "ALM-1002",
      "WT-03",
      "VIB-201",
      "Drivetrain vibration above warning threshold",
      "2026-10-20T11:45:00.000Z",
      "High",
      125,
      "Active",
      10.8,
      77,
      168,
      2050,
    ],
    [
      "ALM-1003",
      "WT-07",
      "TMP-310",
      "Gearbox oil temperature high",
      "2026-10-21T04:20:00.000Z",
      "High",
      75,
      "Acknowledged",
      4.2,
      94,
      170,
      2600,
    ],
    [
      "ALM-1004",
      "WT-01",
      "COM-101",
      "Controller communication timeout",
      "2026-10-21T08:10:00.000Z",
      "Medium",
      25,
      "Resolved",
      3.1,
      68,
      171,
      3000,
    ],
    [
      "ALM-1005",
      "WT-03",
      "HYD-410",
      "Hydraulic pressure outside operating band",
      "2026-10-22T02:30:00.000Z",
      "High",
      95,
      "Active",
      8.6,
      81,
      118,
      1600,
    ],
    [
      "ALM-1006",
      "WT-05",
      "TMP-310",
      "Gearbox oil temperature high",
      "2026-10-22T14:00:00.000Z",
      "Medium",
      42,
      "Active",
      4.8,
      87,
      169,
      2450,
    ],
    [
      "ALM-1007",
      "WT-07",
      "COM-101",
      "Controller communication timeout",
      "2026-10-23T09:00:00.000Z",
      "Low",
      10,
      "Resolved",
      3.3,
      70,
      171,
      2900,
    ],
  ];

  return rows.map(
    ([
      alarmId,
      turbine,
      code,
      description,
      timestamp,
      severity,
      duration,
      status,
      vibration,
      temperature,
      pressure,
      power,
    ]) => {
      const suggestion = suggestRootCause({
        alarm_code: code,
        vibration_mm_s: vibration,
        temperature_c: temperature,
        hydraulic_pressure_bar: pressure,
      });
      const deptRec = recommendDepartment(code, description);
      const resolved = status === "Resolved";
      return {
        id: `demo-${alarmId}`,
        alarm_id: alarmId,
        turbine_id: turbine,
        alarm_code: code,
        description,
        severity,
        timestamp,
        duration_min: duration,
        status,
        vibration_mm_s: vibration,
        temperature_c: temperature,
        hydraulic_pressure_bar: pressure,
        estimated_power_kw: power,
        suggested_root_cause: suggestion.cause,
        confirmed_root_cause: resolved ? "Confirmed during demo inspection" : null,
        technician: resolved ? "Neha Electrical" : null,
        department_recommendation: deptRec.recommended_department,
        department_confidence: deptRec.confidence,
        department_is_provisional: deptRec.is_provisional,
        department_review_status: deptRec.review_status,
        resolution_notes: resolved ? "Demo resolution recorded for this alarm." : null,
        source: "demo",
        created_at: timestamp,
        updated_at: timestamp,
      };
    },
  );
}

function mulberry32(seed: number) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function generatedAlarms(): AlarmRecord[] {
  const templates = [
    ["VIB-201", "Drivetrain vibration above warning threshold", "High"],
    ["TMP-310", "Gearbox oil temperature high", "High"],
    ["HYD-410", "Hydraulic pressure outside operating band", "Medium"],
    ["COM-101", "Controller communication timeout", "Low"],
    ["PIT-220", "Pitch actuator response slow", "Medium"],
  ] as const;
  const random = mulberry32(14);
  const start = Date.UTC(2026, 8, 24, 0, 0, 0);
  const rows: AlarmRecord[] = [];

  for (let index = 0; index < 110; index += 1) {
    const turbine =
      index % 4 === 0
        ? "WT-03"
        : `WT-${String(1 + Math.floor(random() * 10)).padStart(2, "0")}`;
    const template = templates[index % templates.length];
    const timestamp = new Date(start + (index * 6 + Math.floor(random() * 4)) * 3_600_000);
    const severity: Severity =
      turbine === "WT-03" && template[0] === "VIB-201"
        ? random() > 0.4
          ? "Critical"
          : "High"
        : template[2];
    const duration = 12 + Math.floor(random() * 84) + (severity === "Critical" ? 90 : 0);
    const vibration = Number(
      (2 + random() * 4.5 + (template[0] === "VIB-201" ? 3 + random() * 5 : 0)).toFixed(1),
    );
    const temperature = Number(
      (55 + random() * 23 + (template[0] === "TMP-310" ? 10 + random() * 12 : 0)).toFixed(1),
    );
    const pressure = Number(
      (155 + random() * 25 - (template[0] === "HYD-410" ? 35 + random() * 20 : 0)).toFixed(1),
    );
    const power = 1500 + Math.floor(random() * 1800);
    const status: AlarmStatus =
      random() < 0.42 ? "Active" : random() < 0.58 ? "Acknowledged" : "Resolved";
    const alarmId = `ALM-${2000 + index}`;
    const alarmCode = template[0];
    const suggestion = suggestRootCause({
      alarm_code: alarmCode,
      vibration_mm_s: vibration,
      temperature_c: temperature,
      hydraulic_pressure_bar: pressure,
    });
    const deptRec = recommendDepartment(alarmCode, template[1]);

    rows.push({
      id: `demo-${alarmId}`,
      alarm_id: alarmId,
      turbine_id: turbine,
      alarm_code: alarmCode,
      description: template[1],
      severity,
      timestamp: timestamp.toISOString(),
      duration_min: duration,
      status,
      vibration_mm_s: vibration,
      temperature_c: temperature,
      hydraulic_pressure_bar: pressure,
      estimated_power_kw: power,
      suggested_root_cause: suggestion.cause,
      confirmed_root_cause: null,
      technician: null,
      department_recommendation: deptRec.recommended_department,
      department_confidence: deptRec.confidence,
      department_is_provisional: deptRec.is_provisional,
      department_review_status: deptRec.review_status,
      resolution_notes: null,
      source: "demo",
      created_at: timestamp.toISOString(),
      updated_at: timestamp.toISOString(),
    });
  }

  return rows;
}

function seedIncidents(): MaintenanceIncident[] {
  return [
    {
      id: "demo-incident-1",
      alarm_id: "ALM-1001",
      turbine_id: "WT-03",
      title: "Replace drivetrain bearing set",
      technician: "Alex Morgan",
      priority: "Critical",
      due_date: "2026-10-24",
      status: "In Progress",
      notes: "Vibration at 11.4 mm/s. Bearing inspection scheduled; crane booked.",
      resolution_summary: null,
      created_at: "2026-10-21T08:00:00.000Z",
      updated_at: "2026-10-22T09:00:00.000Z",
      resolved_at: null,
    },
    {
      id: "demo-incident-2",
      alarm_id: "ALM-1003",
      turbine_id: "WT-07",
      title: "Investigate gearbox oil overheating",
      technician: "Priya Shah",
      priority: "High",
      due_date: "2026-10-26",
      status: "Assigned",
      notes: "Cooler fan inspected; oil sample sent to lab.",
      resolution_summary: null,
      created_at: "2026-10-22T09:30:00.000Z",
      updated_at: "2026-10-22T09:30:00.000Z",
      resolved_at: null,
    },
    {
      id: "demo-incident-3",
      alarm_id: "ALM-1005",
      turbine_id: "WT-03",
      title: "Repair hydraulic pressure drop",
      technician: "Jordan Lee",
      priority: "High",
      due_date: "2026-10-22",
      status: "Open",
      notes: "Suspected hose leak near the pitch manifold.",
      resolution_summary: null,
      created_at: "2026-10-22T12:00:00.000Z",
      updated_at: "2026-10-22T12:00:00.000Z",
      resolved_at: null,
    },
    {
      id: "demo-incident-4",
      alarm_id: "ALM-1002",
      turbine_id: "WT-03",
      title: "Pitch system vibration follow-up",
      technician: "Field Team A",
      priority: "Medium",
      due_date: "2026-10-20",
      status: "Resolved",
      notes: "Re-torqued pitch bearing bolts.",
      resolution_summary: "Re-torque completed; vibration reduced to 4.1 mm/s.",
      created_at: "2026-10-18T10:00:00.000Z",
      updated_at: "2026-10-22T10:00:00.000Z",
      resolved_at: "2026-10-22T10:00:00.000Z",
    },
  ];
}

function seedStore(): DemoStore {
  const alarms = [...sampleAlarms(), ...generatedAlarms()];
  const incidents = seedIncidents();
  return {
    alarms,
    incidents,
    turbines: TURBINES,
    audit: [
      {
        id: 6,
        entity_type: "maintenance_incidents",
        entity_id: "demo-incident-4",
        action: "UPDATE",
        actor: null,
        changes: {},
        created_at: "2026-10-22T10:00:00.000Z",
      },
      {
        id: 5,
        entity_type: "alarm_history",
        entity_id: "demo-ALM-1002",
        action: "UPDATE",
        actor: null,
        changes: {},
        created_at: "2026-10-22T09:20:00.000Z",
      },
      {
        id: 4,
        entity_type: "maintenance_incidents",
        entity_id: "demo-incident-3",
        action: "INSERT",
        actor: null,
        changes: {},
        created_at: "2026-10-22T12:00:00.000Z",
      },
      {
        id: 3,
        entity_type: "maintenance_incidents",
        entity_id: "demo-incident-2",
        action: "INSERT",
        actor: null,
        changes: {},
        created_at: "2026-10-22T09:30:00.000Z",
      },
      {
        id: 2,
        entity_type: "maintenance_incidents",
        entity_id: "demo-incident-1",
        action: "INSERT",
        actor: null,
        changes: {},
        created_at: "2026-10-21T08:00:00.000Z",
      },
      {
        id: 1,
        entity_type: "alarm_history",
        entity_id: "demo-ALM-1001",
        action: "INSERT",
        actor: null,
        changes: {},
        created_at: "2026-10-20T06:15:00.000Z",
      },
    ],
    assignments: [
      {
        id: "demo-assignment-1",
        incident_id: "demo-incident-1",
        technician: "Alex Morgan",
        assigned_at: "2026-10-21T08:00:00.000Z",
        unassigned_at: null,
        notes: "Initial assignment",
      },
      {
        id: "demo-assignment-2",
        incident_id: "demo-incident-2",
        technician: "Priya Shah",
        assigned_at: "2026-10-22T09:30:00.000Z",
        unassigned_at: null,
        notes: "Initial assignment",
      },
      {
        id: "demo-assignment-3",
        incident_id: "demo-incident-3",
        technician: "Jordan Lee",
        assigned_at: "2026-10-22T12:00:00.000Z",
        unassigned_at: null,
        notes: "Initial assignment",
      },
    ],
    nextAuditId: 7,
    nextIncidentId: 5,
  };
}

export function resetDemoStore(): void {
  globalForDemo.__windsageDemoStore = seedStore();
}

function store(): DemoStore {
  if (!globalForDemo.__windsageDemoStore) {
    globalForDemo.__windsageDemoStore = seedStore();
  }
  return globalForDemo.__windsageDemoStore;
}

function addAudit(
  entityType: string,
  entityId: string,
  action: "INSERT" | "UPDATE" | "DELETE",
): void {
  const current = store();
  current.audit.unshift({
    id: current.nextAuditId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    actor: null,
    changes: {},
    created_at: new Date().toISOString(),
  });
  current.nextAuditId += 1;
}

function withAlarm(incident: MaintenanceIncident): MaintenanceIncident {
  const alarm = store().alarms.find((item) => item.alarm_id === incident.alarm_id);
  return {
    ...incident,
    alarm_history: alarm
      ? { alarm_code: alarm.alarm_code, description: alarm.description, severity: alarm.severity }
      : (incident.alarm_history ?? null),
  };
}

export function demoListTurbines(): Turbine[] {
  return [...store().turbines].sort((a, b) => a.id.localeCompare(b.id));
}

export function demoListAlarms(filters: AlarmFilters, limit = 500): AlarmRecord[] {
  const window = resolveDateWindow(filters);
  const search = sanitizeSearchTerm(filters.q).toLowerCase();
  const gte = window.gte ? new Date(window.gte).getTime() : null;
  const lt = window.lt ? new Date(window.lt).getTime() : null;

  return store()
    .alarms.filter((alarm) => {
      if (filters.turbine && alarm.turbine_id !== filters.turbine) return false;
      if (filters.severities.length && !filters.severities.includes(alarm.severity)) return false;
      if (filters.statuses.length && !filters.statuses.includes(alarm.status)) return false;
      const time = new Date(alarm.timestamp).getTime();
      if (gte !== null && time < gte) return false;
      if (lt !== null && time >= lt) return false;
      if (
        search &&
        !`${alarm.alarm_id} ${alarm.alarm_code} ${alarm.description}`
          .toLowerCase()
          .includes(search)
      ) {
        return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime() ||
        b.id.localeCompare(a.id),
    )
    .slice(0, limit);
}

export function demoGetAlarm(alarmId: string): AlarmRecord | null {
  return store().alarms.find((alarm) => alarm.alarm_id === alarmId) ?? null;
}

export function demoAlarmRecurrence(turbineId: string, alarmCode: string): number {
  return store().alarms.filter(
    (alarm) => alarm.turbine_id === turbineId && alarm.alarm_code === alarmCode,
  ).length;
}

export function demoCreateAlarm(input: AlarmInsert): AlarmRecord {
  const prepared = prepareAlarmForInsert({ ...input, source: input.source ?? "demo" });
  if (demoGetAlarm(prepared.alarm_id)) {
    throw new Error(`Alarm ${prepared.alarm_id} already exists.`);
  }
  const now = new Date().toISOString();
  const record: AlarmRecord = {
    id: `demo-${prepared.alarm_id}`,
    alarm_id: prepared.alarm_id,
    turbine_id: prepared.turbine_id,
    alarm_code: prepared.alarm_code,
    description: prepared.description,
    severity: prepared.severity,
    timestamp: prepared.timestamp,
    duration_min: prepared.duration_min,
    status: prepared.status,
    vibration_mm_s: prepared.vibration_mm_s,
    temperature_c: prepared.temperature_c,
    hydraulic_pressure_bar: prepared.hydraulic_pressure_bar,
    estimated_power_kw: prepared.estimated_power_kw,
    suggested_root_cause: prepared.suggested_root_cause ?? null,
    confirmed_root_cause: prepared.confirmed_root_cause ?? null,
    technician: prepared.technician ?? null,
    department_recommendation: prepared.department_recommendation ?? null,
    department_confidence: prepared.department_confidence ?? null,
    department_is_provisional: prepared.department_is_provisional ?? null,
    department_review_status: prepared.department_review_status ?? null,
    resolution_notes: prepared.resolution_notes ?? null,
    source: prepared.source ?? "demo",
    created_at: now,
    updated_at: now,
  };
  store().alarms.unshift(record);
  addAudit("alarm_history", record.id, "INSERT");
  return record;
}

export function demoUpdateAlarm(
  alarmId: string,
  patch: {
    status?: AlarmStatus;
    technician?: string | null;
    confirmed_root_cause?: string | null;
    resolution_notes?: string | null;
    department_recommendation?: string | null;
    department_confidence?: number | null;
    department_is_provisional?: boolean | null;
    department_review_status?: string | null;
  },
): AlarmRecord {
  const alarm = demoGetAlarm(alarmId);
  if (!alarm) throw new Error("Alarm not found.");
  Object.assign(alarm, patch, { updated_at: new Date().toISOString() });
  addAudit("alarm_history", alarm.id, "UPDATE");
  return alarm;
}

export function demoImportAlarms(rows: AlarmInsert[]): DemoImportResult {
  const current = store();
  const duplicates: { alarmId: string; reason: string }[] = [];
  let imported = 0;

  rows.forEach((row) => {
    const compositeExists = current.alarms.some(
      (alarm) =>
        alarm.turbine_id === row.turbine_id &&
        alarm.alarm_code === row.alarm_code &&
        new Date(alarm.timestamp).getTime() === new Date(row.timestamp).getTime(),
    );
    if (demoGetAlarm(row.alarm_id) || compositeExists) {
      duplicates.push({
        alarmId: row.alarm_id,
        reason: "An alarm with this ID or the same turbine/timestamp/code already exists.",
      });
      return;
    }
    if (!current.turbines.some((turbine) => turbine.id === row.turbine_id)) {
      current.turbines.push({
        id: row.turbine_id,
        name: row.turbine_id,
        site: null,
        model: null,
        capacity_kw: 3500,
      });
    }
    demoCreateAlarm(row);
    imported += 1;
  });

  return { imported, duplicates };
}

export function demoDeleteAlarm(alarmId: string): void {
  const current = store();
  const index = current.alarms.findIndex((alarm) => alarm.alarm_id === alarmId);
  if (index === -1) return;
  const [removed] = current.alarms.splice(index, 1);
  addAudit("alarm_history", removed.id, "DELETE");
}

export function demoListIncidents(limit = 200): MaintenanceIncident[] {
  return [...store().incidents]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
    .map(withAlarm);
}

export function demoGetIncident(id: string): MaintenanceIncident | null {
  const incident = store().incidents.find((item) => item.id === id);
  return incident ? withAlarm(incident) : null;
}

export function demoCreateIncident(input: DemoIncidentInput): MaintenanceIncident {
  const current = store();
  const alarm = demoGetAlarm(input.alarm_id);
  if (!alarm) throw new Error("The selected alarm no longer exists.");
  const now = new Date().toISOString();
  const incident: MaintenanceIncident = {
    id: `demo-incident-${current.nextIncidentId}`,
    alarm_id: input.alarm_id,
    turbine_id: input.turbine_id,
    title: input.title,
    technician: input.technician,
    priority: input.priority,
    due_date: input.due_date,
    status: input.technician === "Unassigned" ? "Open" : "Assigned",
    notes: input.notes,
    resolution_summary: null,
    created_at: now,
    updated_at: now,
    resolved_at: null,
  };
  current.nextIncidentId += 1;
  current.incidents.unshift(incident);
  if (input.technician !== "Unassigned") {
    current.assignments.push({
      id: `demo-assignment-${current.assignments.length + 1}`,
      incident_id: incident.id,
      technician: input.technician,
      assigned_at: now,
      unassigned_at: null,
      notes: "Initial assignment",
    });
  }
  addAudit("maintenance_incidents", incident.id, "INSERT");
  return withAlarm(incident);
}

export function demoUpdateIncident(
  id: string,
  patch: DemoIncidentUpdate,
): MaintenanceIncident {
  const current = store();
  const incident = current.incidents.find((item) => item.id === id);
  if (!incident) throw new Error("Incident not found.");
  const previousTechnician = incident.technician;
  const now = new Date().toISOString();
  incident.status = patch.status;
  incident.technician = patch.technician;
  incident.priority = patch.priority;
  incident.due_date = patch.due_date;
  incident.notes = patch.notes;
  incident.resolution_summary = patch.resolution_summary;
  incident.resolved_at =
    patch.status === "Resolved" ? (incident.resolved_at ?? now) : null;
  incident.updated_at = now;

  if (previousTechnician !== patch.technician) {
    current.assignments.forEach((assignment) => {
      if (assignment.incident_id === id && !assignment.unassigned_at) {
        assignment.unassigned_at = now;
      }
    });
    if (patch.technician !== "Unassigned") {
      current.assignments.push({
        id: `demo-assignment-${current.assignments.length + 1}`,
        incident_id: id,
        technician: patch.technician,
        assigned_at: now,
        unassigned_at: null,
        notes: "Technician reassignment",
      });
    }
  }
  addAudit("maintenance_incidents", id, "UPDATE");
  return withAlarm(incident);
}

export function demoListRecentAudit(limit = 10): DemoAuditRecord[] {
  return [...store().audit]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}
