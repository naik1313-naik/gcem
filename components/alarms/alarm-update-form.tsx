"use client";

import { AlertCircle, CheckCircle2, Save } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateAlarmAction } from "@/app/(dashboard)/alarms/actions";
import { ALARM_STATUSES, TECHNICIANS, type ActionState, type AlarmRecord } from "@/lib/types";

const initial: ActionState = { ok: false, message: "" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      <Save className="h-4 w-4" />
      {pending ? "Saving…" : "Save alarm record"}
    </button>
  );
}

export function AlarmUpdateForm({ alarm }: { alarm: AlarmRecord }) {
  const [state, formAction] = useActionState(updateAlarmAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="alarm_id" value={alarm.alarm_id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="alarm-status">
            Alarm status
          </label>
          <select id="alarm-status" name="status" defaultValue={alarm.status} className="field">
            {ALARM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="alarm-technician">
            Technician
          </label>
          <select
            id="alarm-technician"
            name="technician"
            defaultValue={alarm.technician ?? "Unassigned"}
            className="field"
          >
            {TECHNICIANS.map((technician) => (
              <option key={technician} value={technician}>
                {technician}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="confirmed-cause">
          Confirmed root cause
        </label>
        <input
          id="confirmed-cause"
          name="confirmed_root_cause"
          defaultValue={alarm.confirmed_root_cause ?? ""}
          placeholder="Record the inspected and confirmed cause"
          className="field"
          maxLength={500}
        />
      </div>

      <div>
        <label className="label" htmlFor="alarm-resolution">
          Resolution notes
        </label>
        <textarea
          id="alarm-resolution"
          name="resolution_notes"
          defaultValue={alarm.resolution_notes ?? ""}
          rows={3}
          maxLength={2000}
          placeholder="Work performed, parts replaced, follow-up required"
          className="field resize-y"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton />
        {state.message ? (
          <span
            className={
              state.ok
                ? "inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"
                : "inline-flex items-center gap-1.5 text-xs font-semibold text-red-700"
            }
          >
            {state.ok ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
