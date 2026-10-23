"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { updateAlarm } from "@/lib/db/alarms";
import { resetDemoStore } from "@/lib/demo-store";
import { isDemoMode } from "@/lib/demo-mode";
import { ALARM_STATUSES, type AlarmStatus } from "@/lib/types";

function revalidateConsole() {
  revalidatePath("/", "layout");
  revalidatePath("/incidents");
  revalidatePath("/recurrence");
  revalidatePath("/root-cause");
  revalidatePath("/alarms");
  revalidatePath("/maintenance");
  revalidatePath("/insights");
}

export async function resetDemoDataAction() {
  await requireUser();
  if (!isDemoMode()) return;
  resetDemoStore();
  revalidateConsole();
}

export async function setAlarmStatusAction(alarmId: string, status: AlarmStatus) {
  await requireUser();
  if (!alarmId) throw new Error("Alarm ID is required.");
  if (!(ALARM_STATUSES as readonly string[]).includes(status)) {
    throw new Error("Invalid alarm status.");
  }
  await updateAlarm(alarmId, { status });
  revalidateConsole();
}
