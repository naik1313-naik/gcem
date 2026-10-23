import "server-only";

import {
  demoCreateIncident,
  demoGetIncident,
  demoListIncidents,
  demoListRecentAudit,
  demoUpdateIncident,
} from "@/lib/demo-store";
import { isDemoMode } from "@/lib/demo-mode";
import { createClient } from "@/lib/supabase/server";
import type { IncidentStatus, MaintenanceIncident, Severity } from "@/lib/types";

export interface AuditRecord {
  id: number;
  entity_type: string;
  entity_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  actor: string | null;
  created_at: string;
}

export interface IncidentInput {
  alarm_id: string;
  turbine_id: string;
  title: string;
  technician: string;
  priority: Severity;
  due_date: string | null;
  notes: string | null;
}

export interface IncidentUpdate {
  status: IncidentStatus;
  technician: string;
  priority: Severity;
  due_date: string | null;
  notes: string | null;
  resolution_summary: string | null;
}

function fail(message: string, error: { message: string } | null): never {
  throw new Error(error?.message ? `${message}: ${error.message}` : message);
}

function normalizeIncident(row: MaintenanceIncident): MaintenanceIncident {
  const relation = row.alarm_history as unknown;
  return {
    ...row,
    alarm_history: Array.isArray(relation) ? (relation[0] ?? null) : (relation ?? null),
  };
}

export async function listIncidents(limit = 200): Promise<MaintenanceIncident[]> {
  if (isDemoMode()) return demoListIncidents(limit);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("maintenance_incidents")
    .select("*, alarm_history(alarm_code,description,severity)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("Could not load maintenance incidents", error);
  return ((data ?? []) as MaintenanceIncident[]).map(normalizeIncident);
}

export async function getIncident(id: string): Promise<MaintenanceIncident | null> {
  if (isDemoMode()) return demoGetIncident(id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("maintenance_incidents")
    .select("*, alarm_history(alarm_code,description,severity)")
    .eq("id", id)
    .maybeSingle();
  if (error) fail("Could not load incident", error);
  return data ? normalizeIncident(data as MaintenanceIncident) : null;
}

async function recordAssignment(
  incidentId: string,
  technician: string,
  previousTechnician?: string | null,
  notes?: string,
) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  if (previousTechnician && previousTechnician !== technician) {
    const { error } = await supabase
      .from("technician_assignments")
      .update({ unassigned_at: now })
      .eq("incident_id", incidentId)
      .is("unassigned_at", null);
    if (error) fail("Could not close the previous technician assignment", error);
  }

  if (technician && technician !== "Unassigned") {
    const { error } = await supabase.from("technician_assignments").insert({
      incident_id: incidentId,
      technician,
      assigned_at: now,
      notes: notes ?? null,
    });
    if (error) fail("Could not save the technician assignment", error);
  }
}

export async function createIncident(input: IncidentInput): Promise<MaintenanceIncident> {
  if (isDemoMode()) return demoCreateIncident(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("maintenance_incidents")
    .insert({
      alarm_id: input.alarm_id,
      turbine_id: input.turbine_id,
      title: input.title,
      technician: input.technician,
      priority: input.priority,
      due_date: input.due_date,
      status: input.technician === "Unassigned" ? "Open" : "Assigned",
      notes: input.notes,
    })
    .select("*, alarm_history(alarm_code,description,severity)")
    .single();
  if (error) fail("Could not create incident", error);

  if (input.technician !== "Unassigned") {
    await recordAssignment(data.id, input.technician, null, "Initial assignment");
  }
  return normalizeIncident(data as MaintenanceIncident);
}

export async function updateIncident(
  id: string,
  patch: IncidentUpdate,
): Promise<MaintenanceIncident> {
  if (isDemoMode()) return demoUpdateIncident(id, patch);
  const current = await getIncident(id);
  if (!current) throw new Error("Incident not found.");

  const supabase = await createClient();
  const now = new Date().toISOString();
  const resolvedAt =
    patch.status === "Resolved" ? (current.resolved_at ?? now) : null;

  const { data, error } = await supabase
    .from("maintenance_incidents")
    .update({
      status: patch.status,
      technician: patch.technician,
      priority: patch.priority,
      due_date: patch.due_date,
      notes: patch.notes,
      resolution_summary: patch.resolution_summary,
      resolved_at: resolvedAt,
    })
    .eq("id", id)
    .select("*, alarm_history(alarm_code,description,severity)")
    .single();
  if (error) fail("Could not update incident", error);

  if (current.technician !== patch.technician) {
    await recordAssignment(id, patch.technician, current.technician, "Technician reassignment");
  }

  return normalizeIncident(data as MaintenanceIncident);
}

export async function listRecentAudit(limit = 10): Promise<AuditRecord[]> {
  if (isDemoMode()) return demoListRecentAudit(limit);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_history")
    .select("id,entity_type,entity_id,action,actor,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("Could not load audit history", error);
  return (data ?? []) as AuditRecord[];
}
