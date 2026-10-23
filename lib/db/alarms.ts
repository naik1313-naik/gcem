import "server-only";

import { prepareAlarmForInsert } from "@/lib/alarm-creation";
import {
  demoAlarmRecurrence,
  demoCreateAlarm,
  demoDeleteAlarm,
  demoGetAlarm,
  demoImportAlarms,
  demoListAlarms,
  demoListTurbines,
  demoUpdateAlarm,
} from "@/lib/demo-store";
import { isDemoMode } from "@/lib/demo-mode";
import { resolveDateWindow, sanitizeSearchTerm } from "@/lib/filters";
import { createClient } from "@/lib/supabase/server";
import type {
  AlarmFilters,
  AlarmInsert,
  AlarmRecord,
  AlarmStatus,
  Turbine,
} from "@/lib/types";

export const EMPTY_FILTERS: AlarmFilters = {
  turbine: "",
  severities: [],
  statuses: [],
  q: "",
  exactDate: "",
  from: "",
  to: "",
  sort: "newest",
};

export interface DbDuplicate {
  alarmId: string;
  reason: string;
}

export interface ImportResult {
  imported: number;
  duplicates: DbDuplicate[];
}

function fail(message: string, error: { message: string } | null): never {
  throw new Error(error?.message ? `${message}: ${error.message}` : message);
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

export async function listTurbines(): Promise<Turbine[]> {
  if (isDemoMode()) return demoListTurbines();
  const supabase = await createClient();
  const { data, error } = await supabase.from("turbines").select("*").order("id");
  if (error) fail("Could not load turbines", error);
  return (data ?? []) as Turbine[];
}

export async function listAlarms(filters: AlarmFilters, limit = 500): Promise<AlarmRecord[]> {
  if (isDemoMode()) return demoListAlarms(filters, limit);
  const supabase = await createClient();

  const buildQuery = () => {
    let query = supabase.from("alarm_history").select("*");

    if (filters.turbine) query = query.eq("turbine_id", filters.turbine);
    if (filters.severities.length) query = query.in("severity", filters.severities);
    if (filters.statuses.length) query = query.in("status", filters.statuses);

    const window = resolveDateWindow(filters);
    if (window.gte) query = query.gte("timestamp", window.gte);
    if (window.lt) query = query.lt("timestamp", window.lt);

    const search = sanitizeSearchTerm(filters.q);
    if (search) {
      query = query.or(
        `alarm_id.ilike.%${search}%,alarm_code.ilike.%${search}%,description.ilike.%${search}%`,
      );
    }

    return query;
  };

  // Supabase projects commonly cap a single response at 1,000 rows. Page
  // through the result set so larger exports and dashboard views stay complete.
  const pageSize = Math.min(1000, limit);
  const rows: AlarmRecord[] = [];
  for (let offset = 0; offset < limit; offset += pageSize) {
    const end = Math.min(offset + pageSize, limit) - 1;
    const { data, error } = await buildQuery()
      .order("timestamp", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, end);
    if (error) fail("Could not load alarms", error);
    if (!data?.length) break;
    rows.push(...(data as AlarmRecord[]));
    if (data.length < pageSize) break;
  }

  return rows;
}

export async function getAlarm(alarmId: string): Promise<AlarmRecord | null> {
  if (isDemoMode()) return demoGetAlarm(alarmId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alarm_history")
    .select("*")
    .eq("alarm_id", alarmId)
    .maybeSingle();
  if (error) fail("Could not load alarm", error);
  return (data as AlarmRecord | null) ?? null;
}

export async function getAlarmRecurrence(turbineId: string, alarmCode: string): Promise<number> {
  if (isDemoMode()) return demoAlarmRecurrence(turbineId, alarmCode);
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("alarm_history")
    .select("alarm_id", { count: "exact", head: true })
    .eq("turbine_id", turbineId)
    .eq("alarm_code", alarmCode);
  if (error) fail("Could not calculate alarm recurrence", error);
  return count ?? 1;
}

export async function createAlarm(input: AlarmInsert): Promise<AlarmRecord> {
  if (isDemoMode()) return demoCreateAlarm(input);
  const supabase = await createClient();
  const prepared = prepareAlarmForInsert(input);
  const { data, error } = await supabase
    .from("alarm_history")
    .insert(prepared)
    .select("*")
    .single();
  if (error) fail("Could not create alarm", error);
  return data as AlarmRecord;
}

export interface AlarmUpdate {
  status?: AlarmStatus;
  technician?: string | null;
  confirmed_root_cause?: string | null;
  resolution_notes?: string | null;
  department_recommendation?: string | null;
  department_confidence?: number | null;
  department_is_provisional?: boolean | null;
  department_review_status?: string | null;
}

export async function updateAlarm(alarmId: string, patch: AlarmUpdate): Promise<AlarmRecord> {
  if (isDemoMode()) return demoUpdateAlarm(alarmId, patch);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alarm_history")
    .update(patch)
    .eq("alarm_id", alarmId)
    .select("*")
    .single();
  if (error) fail("Could not update alarm", error);
  return data as AlarmRecord;
}

async function existingDuplicateIndex(rows: AlarmInsert[]) {
  const supabase = await createClient();
  const ids = [...new Set(rows.map((row) => row.alarm_id))];
  const alarmIds = new Set<string>();
  for (const batch of chunk(ids, 100)) {
    const { data, error } = await supabase
      .from("alarm_history")
      .select("alarm_id")
      .in("alarm_id", batch);
    if (error) fail("Could not check duplicate alarm IDs", error);
    (data ?? []).forEach((row: { alarm_id: string }) => alarmIds.add(row.alarm_id));
  }

  const composites = new Set<string>();
  const turbines = [...new Set(rows.map((row) => row.turbine_id))];
  const timestamps = rows
    .map((row) => new Date(row.timestamp).getTime())
    .filter((value) => Number.isFinite(value));
  if (turbines.length && timestamps.length) {
    const min = new Date(Math.min(...timestamps)).toISOString();
    const max = new Date(Math.max(...timestamps)).toISOString();
    for (const turbineBatch of chunk(turbines, 50)) {
      const { data, error } = await supabase
        .from("alarm_history")
        .select("alarm_id,turbine_id,timestamp,alarm_code")
        .in("turbine_id", turbineBatch)
        .gte("timestamp", min)
        .lte("timestamp", max);
      if (error) fail("Could not check duplicate alarm signatures", error);
      (data ?? []).forEach(
        (row: { alarm_id: string; turbine_id: string; timestamp: string; alarm_code: string }) => {
          alarmIds.add(row.alarm_id);
          composites.add(
            `${row.turbine_id}|${new Date(row.timestamp).toISOString()}|${row.alarm_code}`,
          );
        },
      );
    }
  }

  return { alarmIds, composites };
}

export async function importAlarms(rows: AlarmInsert[]): Promise<ImportResult> {
  if (!rows.length) return { imported: 0, duplicates: [] };
  if (isDemoMode()) return demoImportAlarms(rows);

  const supabase = await createClient();
  const existing = await existingDuplicateIndex(rows);
  const duplicates: DbDuplicate[] = [];
  const seen = new Set<string>();
  const accepted: AlarmInsert[] = [];

  rows.forEach((row) => {
    if (seen.has(row.alarm_id)) {
      duplicates.push({
        alarmId: row.alarm_id,
        reason: "Duplicate alarm_id in the current import.",
      });
      return;
    }
    seen.add(row.alarm_id);

    const composite = `${row.turbine_id}|${new Date(row.timestamp).toISOString()}|${row.alarm_code}`;
    if (existing.alarmIds.has(row.alarm_id) || existing.composites.has(composite)) {
      duplicates.push({
        alarmId: row.alarm_id,
        reason: "An alarm with this ID or the same turbine/timestamp/code already exists.",
      });
      return;
    }
    accepted.push(prepareAlarmForInsert(row));
  });

  const existingTurbines = new Set((await listTurbines()).map((turbine) => turbine.id));
  const missingTurbines = [...new Set(accepted.map((row) => row.turbine_id))]
    .filter((id) => !existingTurbines.has(id))
    .map((id) => ({ id, name: id, site: null, model: null, capacity_kw: 3500 }));

  if (missingTurbines.length) {
    const { error } = await supabase.from("turbines").insert(missingTurbines);
    if (error && error.code !== "23505") fail("Could not create turbine records", error);
  }

  // Imports are capped at 1,000 rows, so insert them in one request. This keeps
  // the alarm batch atomic and avoids a partially imported file.
  if (accepted.length) {
    const { error } = await supabase.from("alarm_history").insert(accepted);
    if (error) fail("Could not import alarms", error);
  }

  return { imported: accepted.length, duplicates };
}

export async function deleteAlarm(alarmId: string): Promise<void> {
  if (isDemoMode()) return demoDeleteAlarm(alarmId);
  const supabase = await createClient();
  const { error } = await supabase.from("alarm_history").delete().eq("alarm_id", alarmId);
  if (error) fail("Could not delete alarm", error);
}
