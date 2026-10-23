"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { updateAlarm } from "@/lib/db/alarms";
import { ALARM_STATUSES, TECHNICIANS, type ActionState, type AlarmStatus } from "@/lib/types";

export async function updateAlarmAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();

  const alarmId = String(formData.get("alarm_id") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  const technician = String(formData.get("technician") ?? "").trim();
  const confirmedRootCause = String(formData.get("confirmed_root_cause") ?? "").trim();
  const resolutionNotes = String(formData.get("resolution_notes") ?? "").trim();

  if (!alarmId) return { ok: false, message: "Alarm ID is required." };
  if (!(ALARM_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: "Choose a valid alarm status." };
  }
  if (technician && !(TECHNICIANS as readonly string[]).includes(technician)) {
    return { ok: false, message: "Choose a valid technician." };
  }
  if (confirmedRootCause.length > 500) {
    return { ok: false, message: "Confirmed root cause must be 500 characters or fewer." };
  }
  if (resolutionNotes.length > 2000) {
    return { ok: false, message: "Resolution notes must be 2,000 characters or fewer." };
  }

  try {
    await updateAlarm(alarmId, {
      status: status as AlarmStatus,
      technician: technician === "Unassigned" ? null : technician || null,
      confirmed_root_cause: confirmedRootCause || null,
      resolution_notes: resolutionNotes || null,
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update the alarm.",
    };
  }

  revalidatePath("/incidents");
  revalidatePath("/recurrence");
  revalidatePath("/root-cause");
  revalidatePath("/alarms");
  revalidatePath("/insights");
  revalidatePath("/maintenance");
  revalidatePath("/");
  return { ok: true, message: `Alarm ${alarmId} updated.` };
}
