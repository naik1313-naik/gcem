"use client";

import { AlertCircle, CheckCircle2, Plus } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { createIncidentAction } from "@/app/(dashboard)/maintenance/actions";
import { SEVERITIES, TECHNICIANS, type ActionState, type AlarmRecord } from "@/lib/types";

const initial: ActionState = { ok: false, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      <Plus className="h-4 w-4" />
      {pending ? "Creating…" : "Create work order"}
    </button>
  );
}

export function CreateIncidentForm({
  alarms,
  defaultAlarmId,
}: {
  alarms: Pick<AlarmRecord, "alarm_id" | "turbine_id" | "alarm_code" | "severity">[];
  defaultAlarmId?: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(createIncidentAction, initial);
  const initialAlarm = alarms.find((alarm) => alarm.alarm_id === defaultAlarmId) ?? alarms[0];
  const [alarmId, setAlarmId] = useState(initialAlarm?.alarm_id ?? "");
  const selected = useMemo(
    () => alarms.find((alarm) => alarm.alarm_id === alarmId) ?? initialAlarm,
    [alarmId, alarms, initialAlarm],
  );
  const [title, setTitle] = useState(
    selected ? `Investigate ${selected.alarm_code} on ${selected.turbine_id}` : "",
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  function handleAlarmChange(nextId: string) {
    setAlarmId(nextId);
    const alarm = alarms.find((item) => item.alarm_id === nextId);
    if (alarm) setTitle(`Investigate ${alarm.alarm_code} on ${alarm.turbine_id}`);
  }

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className="label" htmlFor="incident-alarm">
          Source alarm
        </label>
        <select
          id="incident-alarm"
          name="alarm_id"
          value={alarmId}
          onChange={(event) => handleAlarmChange(event.target.value)}
          className="field"
          required
        >
          {alarms.length === 0 ? <option value="">No alarms available</option> : null}
          {alarms.map((alarm) => (
            <option key={alarm.alarm_id} value={alarm.alarm_id}>
              {alarm.alarm_id} · {alarm.turbine_id} · {alarm.alarm_code} · {alarm.severity}
            </option>
          ))}
        </select>
      </div>

      <div className="md:col-span-2">
        <label className="label" htmlFor="incident-title">
          Title
        </label>
        <input
          id="incident-title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          className="field"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="incident-technician">
          Assign technician
        </label>
        <select id="incident-technician" name="technician" className="field" defaultValue="Unassigned">
          {TECHNICIANS.map((technician) => (
            <option key={technician} value={technician}>
              {technician}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="incident-priority">
          Priority
        </label>
        <select id="incident-priority" name="priority" className="field" defaultValue="High">
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="incident-due">
          Due date
        </label>
        <input id="incident-due" name="due_date" type="date" className="field" />
      </div>

      <div className="md:col-span-2">
        <label className="label" htmlFor="incident-notes">
          Initial technician notes
        </label>
        <textarea
          id="incident-notes"
          name="notes"
          rows={3}
          maxLength={2000}
          className="field resize-y"
          placeholder="Symptoms, site access constraints, parts required"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <SubmitButton />
        {state.message ? (
          <span
            className={
              state.ok
                ? "inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"
                : "inline-flex items-center gap-1.5 text-xs font-semibold text-red-700"
            }
          >
            {state.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
