"use client";

import { AlertCircle, CheckCircle2, Save } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { updateIncidentAction } from "@/app/(dashboard)/maintenance/actions";
import {
  INCIDENT_STATUSES,
  SEVERITIES,
  TECHNICIANS,
  type ActionState,
  type MaintenanceIncident,
} from "@/lib/types";

const initial: ActionState = { ok: false, message: "" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      <Save className="h-4 w-4" />
      {pending ? "Saving…" : "Save work order"}
    </button>
  );
}

function IncidentFields({ incident }: { incident: MaintenanceIncident }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="incident-status">
            Status
          </label>
          <select id="incident-status" name="status" defaultValue={incident.status} className="field">
            {INCIDENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="incident-edit-technician">
            Technician
          </label>
          <select
            id="incident-edit-technician"
            name="technician"
            defaultValue={incident.technician}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="incident-edit-priority">
            Priority
          </label>
          <select
            id="incident-edit-priority"
            name="priority"
            defaultValue={incident.priority}
            className="field"
          >
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="incident-edit-due">
            Due date
          </label>
          <input
            id="incident-edit-due"
            name="due_date"
            type="date"
            defaultValue={incident.due_date ?? ""}
            className="field"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="incident-edit-notes">
          Technician notes
        </label>
        <textarea
          id="incident-edit-notes"
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={incident.notes ?? ""}
          className="field resize-y"
        />
      </div>

      <div>
        <label className="label" htmlFor="incident-edit-summary">
          Resolution summary
        </label>
        <textarea
          id="incident-edit-summary"
          name="resolution_summary"
          rows={3}
          maxLength={2000}
          defaultValue={incident.resolution_summary ?? ""}
          className="field resize-y"
        />
      </div>
    </>
  );
}

export function UpdateIncidentForm({ incidents }: { incidents: MaintenanceIncident[] }) {
  const router = useRouter();
  const [state, formAction] = useActionState(updateIncidentAction, initial);
  const [incidentId, setIncidentId] = useState(incidents[0]?.id ?? "");
  const selected = incidents.find((incident) => incident.id === incidentId) ?? incidents[0];

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  if (!selected) return null;

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="incident-select">
          Work order
        </label>
        <select
          id="incident-select"
          value={incidentId}
          onChange={(event) => setIncidentId(event.target.value)}
          className="field"
        >
          {incidents.map((incident) => (
            <option key={incident.id} value={incident.id}>
              #{incident.id.slice(0, 8)} · {incident.turbine_id} · {incident.title}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <span className="font-bold text-slate-700">{selected.alarm_id ?? "No alarm linked"}</span>
        {selected.alarm_history ? (
          <>
            {" "}
            · {selected.alarm_history.alarm_code} · {selected.alarm_history.description}
          </>
        ) : null}
      </div>

      <form key={selected.id} action={formAction} className="space-y-4">
        <input type="hidden" name="incident_id" value={selected.id} />
        <IncidentFields incident={selected} />
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
              {state.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {state.message}
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
