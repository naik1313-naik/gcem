"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { getAlarm } from "@/lib/db/alarms";
import { createIncident, updateIncident } from "@/lib/db/incidents";
import {
  INCIDENT_STATUSES,
  SEVERITIES,
  TECHNICIANS,
  type ActionState,
  type IncidentStatus,
  type Severity,
} from "@/lib/types";

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export async function createIncidentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();

  const alarmId = String(formData.get("alarm_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const technician = String(formData.get("technician") ?? "Unassigned");
  const priority = String(formData.get("priority") ?? "High");
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!alarmId) return { ok: false, message: "Select an alarm." };
  if (!title || title.length > 200) {
    return { ok: false, message: "Title is required and must be 200 characters or fewer." };
  }
  if (!(TECHNICIANS as readonly string[]).includes(technician)) {
    return { ok: false, message: "Choose a valid technician." };
  }
  if (!(SEVERITIES as readonly string[]).includes(priority)) {
    return { ok: false, message: "Choose a valid priority." };
  }
  if (dueDate && !validDate(dueDate)) return { ok: false, message: "Enter a valid due date." };
  if (notes.length > 2000) return { ok: false, message: "Notes must be 2,000 characters or fewer." };

  const alarm = await getAlarm(alarmId);
  if (!alarm) return { ok: false, message: "The selected alarm no longer exists." };

  try {
    const incident = await createIncident({
      alarm_id: alarm.alarm_id,
      turbine_id: alarm.turbine_id,
      title,
      technician,
      priority: priority as Severity,
      due_date: dueDate || null,
      notes: notes || null,
    });
    revalidatePath("/incidents");
    revalidatePath("/recurrence");
    revalidatePath("/root-cause");
    revalidatePath("/maintenance");
    revalidatePath("/");
    return { ok: true, message: `Work order created for ${incident.alarm_id}.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not create the work order.",
    };
  }
}

export async function updateIncidentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();

  const id = String(formData.get("incident_id") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  const technician = String(formData.get("technician") ?? "Unassigned");
  const priority = String(formData.get("priority") ?? "");
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const summary = String(formData.get("resolution_summary") ?? "").trim();

  if (!id) return { ok: false, message: "Select a work order." };
  if (!(INCIDENT_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: "Choose a valid incident status." };
  }
  if (!(TECHNICIANS as readonly string[]).includes(technician)) {
    return { ok: false, message: "Choose a valid technician." };
  }
  if (!(SEVERITIES as readonly string[]).includes(priority)) {
    return { ok: false, message: "Choose a valid priority." };
  }
  if (dueDate && !validDate(dueDate)) return { ok: false, message: "Enter a valid due date." };
  if (notes.length > 2000) return { ok: false, message: "Notes must be 2,000 characters or fewer." };
  if (summary.length > 2000) {
    return { ok: false, message: "Resolution summary must be 2,000 characters or fewer." };
  }

  try {
    await updateIncident(id, {
      status: status as IncidentStatus,
      technician,
      priority: priority as Severity,
      due_date: dueDate || null,
      notes: notes || null,
      resolution_summary: summary || null,
    });
    revalidatePath("/incidents");
    revalidatePath("/recurrence");
    revalidatePath("/root-cause");
    revalidatePath("/maintenance");
    revalidatePath("/");
    return { ok: true, message: "Work order updated." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update the work order.",
    };
  }
}
