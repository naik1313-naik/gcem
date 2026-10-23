import type { AlarmRecord, MaintenanceIncident } from "@/lib/types";

export interface TurbineLoss {
  turbine: string;
  lossKwh: number;
}

export interface AlarmLossPoint {
  alarmId: string;
  turbine: string;
  durationMin: number;
  lossKwh: number;
  severity: string;
}

export interface LostProductionResult {
  totalKwh: number;
  percent: number;
  baselineKwh: number;
  byTurbine: TurbineLoss[];
  scatter: AlarmLossPoint[];
}

interface Interval {
  start: number;
  end: number;
  unavailableKw: number;
}

function unavailablePower(alarm: AlarmRecord): number {
  const power = alarm.estimated_power_kw ?? 2500;
  return Math.max(0, 3500 - power);
}

export function computeLostProduction(alarms: AlarmRecord[]): LostProductionResult {
  const byTurbineMap = new Map<string, Interval[]>();
  const scatter: AlarmLossPoint[] = [];

  alarms.forEach((alarm) => {
    const start = new Date(alarm.timestamp).getTime();
    if (Number.isNaN(start)) return;
    const duration = Math.max(0, alarm.duration_min ?? 0);
    const end = start + duration * 60_000;
    const power = unavailablePower(alarm);
    const list = byTurbineMap.get(alarm.turbine_id) ?? [];
    list.push({ start, end, unavailableKw: power });
    byTurbineMap.set(alarm.turbine_id, list);
    scatter.push({
      alarmId: alarm.alarm_id,
      turbine: alarm.turbine_id,
      durationMin: duration,
      lossKwh: (duration / 60) * power,
      severity: alarm.severity,
    });
  });

  const byTurbine: TurbineLoss[] = [];
  byTurbineMap.forEach((intervals, turbine) => {
    intervals.sort((a, b) => a.start - b.start);
    const merged: Interval[] = [];
    intervals.forEach((interval) => {
      const last = merged[merged.length - 1];
      if (last && interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
        last.unavailableKw = Math.max(last.unavailableKw, interval.unavailableKw);
      } else {
        merged.push({ ...interval });
      }
    });
    const lossKwh = merged.reduce(
      (total, interval) =>
        total + ((interval.end - interval.start) / 3_600_000) * interval.unavailableKw,
      0,
    );
    byTurbine.push({ turbine, lossKwh });
  });

  byTurbine.sort((a, b) => b.lossKwh - a.lossKwh);
  const totalKwh = byTurbine.reduce((total, row) => total + row.lossKwh, 0);
  const days = new Set(alarms.map((alarm) => alarm.timestamp.slice(0, 10))).size;
  const turbineCount = new Set(alarms.map((alarm) => alarm.turbine_id)).size;
  const baselineKwh = days * 24 * 3500 * turbineCount;

  return {
    totalKwh,
    percent: baselineKwh > 0 ? (totalKwh / baselineKwh) * 100 : 0,
    baselineKwh,
    byTurbine,
    scatter: scatter.sort((a, b) => b.lossKwh - a.lossKwh),
  };
}

export function meanMttrHours(incidents: MaintenanceIncident[]): number | null {
  const resolved = incidents.filter(
    (incident) => incident.status === "Resolved" && incident.resolved_at && incident.created_at,
  );
  if (!resolved.length) return null;
  const total = resolved.reduce((sum, incident) => {
    const created = new Date(incident.created_at).getTime();
    const resolvedAt = new Date(incident.resolved_at as string).getTime();
    if (Number.isNaN(created) || Number.isNaN(resolvedAt)) return sum;
    return sum + Math.max(0, resolvedAt - created) / 3_600_000;
  }, 0);
  return total / resolved.length;
}
