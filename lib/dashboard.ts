import { meanMttrHours } from "@/lib/analytics";
import { riskScore } from "@/lib/alarm-logic";
import type { AlarmRecord, MaintenanceIncident, Severity } from "@/lib/types";
import { SEVERITIES } from "@/lib/types";

export interface CountPoint {
  name: string;
  value: number;
}

export interface TimelinePoint {
  date: string;
  count: number;
}

export interface DashboardData {
  activeAlarms: number;
  criticalAlarms: number;
  highRiskTurbines: number;
  openIncidents: number;
  criticalOpenIncidents: number;
  overdueIncidents: number;
  mttrHours: number | null;
  estimatedLossMwh: number;
  severity: CountPoint[];
  timeline: TimelinePoint[];
  topCodes: CountPoint[];
  turbines: CountPoint[];
  riskTurbines: CountPoint[];
}

export function buildDashboard(
  alarms: AlarmRecord[],
  incidents: MaintenanceIncident[],
): DashboardData {
  const recurrence = new Map<string, number>();
  alarms.forEach((alarm) => {
    const key = `${alarm.turbine_id}|${alarm.alarm_code}`;
    recurrence.set(key, (recurrence.get(key) ?? 0) + 1);
  });

  const active = alarms.filter((alarm) => alarm.status !== "Resolved");
  const estimatedLossKwh = active.reduce(
    (total, alarm) => total + (alarm.duration_min * (alarm.estimated_power_kw ?? 2500)) / 60,
    0,
  );

  const highRisk = new Set<string>();
  const maxRisk = new Map<string, number>();
  alarms.forEach((alarm) => {
    const result = riskScore({
      ...alarm,
      recurrence: recurrence.get(`${alarm.turbine_id}|${alarm.alarm_code}`) ?? 1,
    });
    maxRisk.set(alarm.turbine_id, Math.max(maxRisk.get(alarm.turbine_id) ?? 0, result.score));
    if (result.category === "High") highRisk.add(alarm.turbine_id);
  });

  const severity = SEVERITIES.map((name) => ({
    name,
    value: alarms.filter((alarm) => alarm.severity === name).length,
  }));

  const timelineMap = new Map<string, number>();
  alarms.forEach((alarm) => {
    const date = alarm.timestamp.slice(0, 10);
    timelineMap.set(date, (timelineMap.get(date) ?? 0) + 1);
  });
  const timeline = [...timelineMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const codeMap = new Map<string, number>();
  const turbineMap = new Map<string, number>();
  alarms.forEach((alarm) => {
    codeMap.set(alarm.alarm_code, (codeMap.get(alarm.alarm_code) ?? 0) + 1);
    turbineMap.set(alarm.turbine_id, (turbineMap.get(alarm.turbine_id) ?? 0) + 1);
  });

  const topCodes = [...codeMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 7)
    .map(([name, value]) => ({ name, value }));

  const turbines = [...turbineMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({ name, value }));

  const riskTurbines = [...maxRisk.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }));

  const openIncidents = incidents.filter((incident) => incident.status !== "Resolved");
  const today = new Date().toISOString().slice(0, 10);

  return {
    activeAlarms: active.length,
    criticalAlarms: active.filter((alarm) => alarm.severity === "Critical").length,
    highRiskTurbines: highRisk.size,
    openIncidents: openIncidents.length,
    criticalOpenIncidents: openIncidents.filter((incident) => incident.priority === "Critical").length,
    overdueIncidents: openIncidents.filter(
      (incident) => incident.due_date && incident.due_date < today,
    ).length,
    mttrHours: meanMttrHours(incidents),
    estimatedLossMwh: estimatedLossKwh / 1000,
    severity,
    timeline,
    topCodes,
    turbines,
    riskTurbines,
  };
}

export function severityCount(alarms: AlarmRecord[], severity: Severity): number {
  return alarms.filter((alarm) => alarm.severity === severity).length;
}
