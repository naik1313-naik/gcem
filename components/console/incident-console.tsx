"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { setAlarmStatusAction } from "@/app/(dashboard)/console-actions";
import { updateAlarmAction } from "@/app/(dashboard)/alarms/actions";
import {
  createIncidentAction,
  updateIncidentAction,
} from "@/app/(dashboard)/maintenance/actions";
import {
  CONSOLE_CATEGORIES,
  alarmDeadline,
  categoryForAlarm,
  downtimeHours,
  estimatedMwh,
  formatDate,
  formatDuration,
  formatMwh,
  incidentForAlarm,
  isOverdue,
  patternForAlarm,
  priorityForAlarm,
  recurrenceGroups,
  severityClass,
  statusClass,
  teamForAlarm,
  workflowStatus,
  type WorkflowStatus,
} from "@/lib/console";
import { suggestRootCause } from "@/lib/alarm-logic";
import {
  ALARM_STATUSES,
  INCIDENT_STATUSES,
  SEVERITIES,
  TECHNICIANS,
  type ActionState,
  type AlarmRecord,
  type MaintenanceIncident,
  type Severity,
} from "@/lib/types";

const initial: ActionState = { ok: false, message: "" };
const WORKFLOW_STATUSES: WorkflowStatus[] = ["New", "Assigned", "In progress", "Resolved"];

interface Row {
  alarm: AlarmRecord;
  incident: MaintenanceIncident | null;
  status: WorkflowStatus;
  owner: string | null;
  category: ReturnType<typeof categoryForAlarm>;
  deadline: number;
  overdue: boolean;
  priority: { score: number; rank: "P1" | "P2" | "P3" };
  recurrence: number;
  loss: number;
  downtimeMinutes: number;
  patternCount: number;
  suggestion: ReturnType<typeof suggestRootCause>;
}

function SubmitButton({
  label,
  pendingLabel,
  className = "btn btn-primary btn-sm",
}: {
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p className={`form-message ${state.ok ? "ok" : "error"}`} role="status">
      {state.message}
    </p>
  );
}

function AlarmUpdateForm({ alarm }: { alarm: AlarmRecord }) {
  const router = useRouter();
  const [state, formAction] = useActionState(updateAlarmAction, initial);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  return (
    <form action={formAction}>
      <input name="alarm_id" type="hidden" value={alarm.alarm_id} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`team-${alarm.alarm_id}`}>Team</label>
          <input
            id={`team-${alarm.alarm_id}`}
            value={teamForAlarm(alarm)}
            disabled
            readOnly
          />
        </div>
        <div className="field">
          <label htmlFor={`owner-${alarm.alarm_id}`}>Owner</label>
          <select
            id={`owner-${alarm.alarm_id}`}
            name="technician"
            defaultValue={alarm.technician ?? "Unassigned"}
          >
            {TECHNICIANS.map((technician) => (
              <option key={technician} value={technician}>
                {technician}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`status-${alarm.alarm_id}`}>Alarm status</label>
          <select id={`status-${alarm.alarm_id}`} name="status" defaultValue={alarm.status}>
            {ALARM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`cause-${alarm.alarm_id}`}>Confirmed root cause</label>
          <input
            id={`cause-${alarm.alarm_id}`}
            name="confirmed_root_cause"
            defaultValue={alarm.confirmed_root_cause ?? ""}
            maxLength={500}
            placeholder="Optional"
          />
        </div>
        <div className="field wide">
          <label htmlFor={`notes-${alarm.alarm_id}`}>Resolution notes</label>
          <textarea
            id={`notes-${alarm.alarm_id}`}
            name="resolution_notes"
            defaultValue={alarm.resolution_notes ?? ""}
            maxLength={2000}
            rows={3}
            placeholder="What was found or repaired?"
          />
        </div>
      </div>
      <div className="action-row">
        <SubmitButton label="Save assignment" pendingLabel="Saving…" />
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function WorkOrderForm({
  alarm,
  incident,
}: {
  alarm: AlarmRecord;
  incident: MaintenanceIncident | null;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    incident ? updateIncidentAction : createIncidentAction,
    initial,
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  return (
    <form action={formAction}>
      {incident ? (
        <input name="incident_id" type="hidden" value={incident.id} />
      ) : (
        <input name="alarm_id" type="hidden" value={alarm.alarm_id} />
      )}
      <div className="form-grid">
        <div className="field wide">
          <label htmlFor={`title-${alarm.alarm_id}`}>Work order title</label>
          <input
            id={`title-${alarm.alarm_id}`}
            name="title"
            defaultValue={
              incident?.title ?? `${alarm.alarm_code} — ${alarm.description}`.slice(0, 200)
            }
            maxLength={200}
            required
          />
        </div>
        {incident ? (
          <div className="field">
            <label htmlFor={`wo-status-${alarm.alarm_id}`}>Work order status</label>
            <select
              id={`wo-status-${alarm.alarm_id}`}
              name="status"
              defaultValue={incident.status}
            >
              {INCIDENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor={`wo-owner-${alarm.alarm_id}`}>Technician</label>
          <select
            id={`wo-owner-${alarm.alarm_id}`}
            name="technician"
            defaultValue={incident?.technician ?? "Unassigned"}
          >
            {TECHNICIANS.map((technician) => (
              <option key={technician} value={technician}>
                {technician}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`wo-priority-${alarm.alarm_id}`}>Priority</label>
          <select
            id={`wo-priority-${alarm.alarm_id}`}
            name="priority"
            defaultValue={incident?.priority ?? alarm.severity}
          >
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`wo-due-${alarm.alarm_id}`}>Deadline</label>
          <input
            id={`wo-due-${alarm.alarm_id}`}
            name="due_date"
            type="date"
            defaultValue={incident?.due_date ?? ""}
          />
        </div>
        <div className="field wide">
          <label htmlFor={`wo-notes-${alarm.alarm_id}`}>Work notes</label>
          <textarea
            id={`wo-notes-${alarm.alarm_id}`}
            name="notes"
            defaultValue={incident?.notes ?? ""}
            maxLength={2000}
            rows={3}
            placeholder="Access, parts, safety or site notes"
          />
        </div>
        {incident ? (
          <div className="field wide">
            <label htmlFor={`wo-summary-${alarm.alarm_id}`}>Resolution summary</label>
            <textarea
              id={`wo-summary-${alarm.alarm_id}`}
              name="resolution_summary"
              defaultValue={incident.resolution_summary ?? ""}
              maxLength={2000}
              rows={2}
            />
          </div>
        ) : null}
      </div>
      <div className="action-row">
        <SubmitButton
          label={incident ? "Save work order" : "Create work order"}
          pendingLabel={incident ? "Saving…" : "Creating…"}
        />
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function Chips({ row }: { row: Row }) {
  return (
    <>
      <span className={`chip chip-${severityClass(row.alarm.severity)}`}>
        {row.alarm.severity}
      </span>
      <span className={`chip chip-${statusClass(row.status)}`}>{row.status}</span>
      {row.overdue ? <span className="chip chip-overdue">Overdue</span> : null}
      <span className={`rank rank-${row.priority.rank.toLowerCase()}`}>{row.priority.rank}</span>
    </>
  );
}

export function IncidentConsole({
  alarms,
  incidents,
  now,
  initialFilters,
  initialAlarmId,
}: {
  alarms: AlarmRecord[];
  incidents: MaintenanceIncident[];
  now: number;
  initialFilters: {
    turbine: string;
    category: string;
    status: string;
    q: string;
    openOnly: boolean;
    exactDate: string;
    from: string;
    to: string;
  };
  initialAlarmId?: string;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialAlarmId && alarms.some((alarm) => alarm.alarm_id === initialAlarmId)
      ? initialAlarmId
      : null,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (initialAlarmId) setSelectedId(initialAlarmId);
  }, [initialAlarmId]);

  const groups = useMemo(() => recurrenceGroups(alarms, now), [alarms, now]);

  const rows = useMemo<Row[]>(() => {
    const recurrenceCounts = new Map<string, number>();
    alarms.forEach((alarm) => {
      const key = `${alarm.turbine_id}|${alarm.alarm_code}`;
      recurrenceCounts.set(key, (recurrenceCounts.get(key) ?? 0) + 1);
    });

    return alarms
      .map((alarm) => {
        const incident = incidentForAlarm(incidents, alarm.alarm_id);
        const category = categoryForAlarm(alarm);
        const recurrence =
          recurrenceCounts.get(`${alarm.turbine_id}|${alarm.alarm_code}`) ?? 1;
        const priority = priorityForAlarm(alarm, recurrence);
        return {
          alarm,
          incident,
          status: workflowStatus(alarm, incident),
          owner:
            incident?.technician && incident.technician !== "Unassigned"
              ? incident.technician
              : alarm.technician && alarm.technician !== "Unassigned"
                ? alarm.technician
                : null,
          category,
          deadline: alarmDeadline(alarm, incident),
          overdue: isOverdue(alarm, incident, now),
          priority,
          recurrence,
          loss: estimatedMwh(alarm),
          downtimeMinutes: downtimeHours(alarm) * 60,
          patternCount: patternForAlarm(alarm, groups)?.count ?? 0,
          suggestion: suggestRootCause({ ...alarm, recurrence }),
        };
      })
      .sort((a, b) => {
        const aResolved = a.status === "Resolved" ? 1 : 0;
        const bResolved = b.status === "Resolved" ? 1 : 0;
        if (aResolved !== bResolved) return aResolved - bResolved;
        if (b.priority.score !== a.priority.score) return b.priority.score - a.priority.score;
        return new Date(b.alarm.timestamp).getTime() - new Date(a.alarm.timestamp).getTime();
      });
  }, [alarms, incidents, now, groups]);

  const filtered = useMemo(() => {
    const query = filters.q.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.turbine && row.alarm.turbine_id !== filters.turbine) return false;
      if (filters.category && row.category.id !== filters.category) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (filters.openOnly && row.status === "Resolved") return false;
      const alarmDate = row.alarm.timestamp.slice(0, 10);
      if (filters.exactDate && alarmDate !== filters.exactDate) return false;
      if (filters.from && alarmDate < filters.from) return false;
      if (filters.to && alarmDate > filters.to) return false;
      if (query) {
        const haystack = [
          row.alarm.alarm_id,
          row.alarm.alarm_code,
          row.alarm.description,
          row.alarm.turbine_id,
          row.owner ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [filters, rows]);

  const selected = selectedId ? rows.find((row) => row.alarm.alarm_id === selectedId) ?? null : null;
  const turbineOptions = [...new Set(alarms.map((alarm) => alarm.turbine_id))].sort();

  useEffect(() => {
    if (selectedId && !rows.some((row) => row.alarm.alarm_id === selectedId)) {
      setSelectedId(null);
    }
  }, [rows, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedId]);

  const update = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch }));

  const clearFilters = () =>
    setFilters({
      turbine: "",
      category: "",
      status: "",
      q: "",
      openOnly: false,
      exactDate: "",
      from: "",
      to: "",
    });

  const runStatus = (status: "Active" | "Acknowledged" | "Resolved") => {
    if (!selected) return;
    startTransition(async () => {
      await setAlarmStatusAction(selected.alarm.alarm_id, status);
      router.refresh();
    });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Incidents</h1>
          <p className="page-sub">
            Every alarm is a work item: owner, deadline, verification and time to resolve.
          </p>
        </div>
        <div className="page-meta">Click a row to assign, start or resolve</div>
      </div>

      <div className="panel">
        <div className="filters">
          <select
            aria-label="Turbine"
            value={filters.turbine}
            onChange={(event) => update({ turbine: event.target.value })}
          >
            <option value="">All turbines</option>
            {turbineOptions.map((turbine) => (
              <option key={turbine} value={turbine}>
                {turbine}
              </option>
            ))}
          </select>
          <select
            aria-label="Category"
            value={filters.category}
            onChange={(event) => update({ category: event.target.value })}
          >
            <option value="">All categories</option>
            {CONSOLE_CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Status"
            value={filters.status}
            onChange={(event) => update({ status: event.target.value })}
          >
            <option value="">Any status</option>
            {WORKFLOW_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <input
            aria-label="Search"
            type="search"
            placeholder="Search code, turbine or owner"
            value={filters.q}
            onChange={(event) => update({ q: event.target.value })}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={filters.openOnly}
              onChange={(event) => update({ openOnly: event.target.checked })}
            />
            Open only
          </label>
          <label className="date-filter">
            From
            <input
              aria-label="From date"
              type="date"
              value={filters.from}
              onChange={(event) => update({ from: event.target.value })}
            />
          </label>
          <label className="date-filter">
            To
            <input
              aria-label="To date"
              type="date"
              value={filters.to}
              onChange={(event) => update({ to: event.target.value })}
            />
          </label>
          <label className="date-filter">
            Exact
            <input
              aria-label="Exact date"
              type="date"
              value={filters.exactDate}
              onChange={(event) => update({ exactDate: event.target.value })}
            />
          </label>
          <div className="spacer" />
          <button className="btn btn-quiet btn-sm" type="button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>P</th>
                <th>Alarm</th>
                <th>Turbine</th>
                <th>Severity</th>
                <th>Started</th>
                <th className="num">Downtime</th>
                <th className="num">Est. MWh</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((row) => (
                <tr
                  key={row.alarm.alarm_id}
                  onClick={() => setSelectedId(row.alarm.alarm_id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(row.alarm.alarm_id);
                    }
                  }}
                  tabIndex={0}
                >
                  <td>
                    {row.status === "Resolved" ? (
                      <span className="faint">—</span>
                    ) : (
                      <span className={`rank rank-${row.priority.rank.toLowerCase()}`}>
                        {row.priority.rank}
                      </span>
                    )}
                  </td>
                  <td className="alarm-cell">
                    <div className="alarm-code">{row.alarm.alarm_code}</div>
                    <div className="alarm-name">{row.alarm.description}</div>
                  </td>
                  <td className="strong">{row.alarm.turbine_id}</td>
                  <td>
                    <span className={`chip chip-${severityClass(row.alarm.severity)}`}>
                      {row.alarm.severity}
                    </span>
                  </td>
                  <td className="muted">{formatDate(row.alarm.timestamp)}</td>
                  <td className="num">{formatDuration(row.downtimeMinutes)}</td>
                  <td className="num">{row.loss.toFixed(1)}</td>
                  <td>
                    {row.owner ? row.owner : <span className="muted">Unassigned</span>}
                  </td>
                  <td>
                    <span className={`chip chip-${statusClass(row.status)}`}>{row.status}</span>
                  </td>
                  <td>
                    {row.status === "Resolved" ? (
                      <span className="chip chip-resolved">Verify</span>
                    ) : row.overdue ? (
                      <span className="chip chip-overdue">
                        Overdue {formatDuration((now - row.deadline) / 60_000)}
                      </span>
                    ) : (
                      <span className="muted">
                        in {formatDuration((row.deadline - now) / 60_000)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <div className="empty">
                      <b>No incidents match</b>
                      Clear one of the filters to widen the result.
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>
            Showing {Math.min(filtered.length, 200)} of {filtered.length} matching ·{" "}
            {alarms.length} total
          </span>
          <span>Dashboard estimates use recorded turbine output</span>
        </div>
      </div>

      {selected ? (
        <>
          <button
            aria-label="Close incident"
            className="drawer-scrim"
            onClick={() => setSelectedId(null)}
            type="button"
          />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="Incident detail">
            <div className="drawer-head">
              <div className="drawer-kicker">
                {selected.alarm.turbine_id} · {selected.category.label} ·{" "}
                {selected.alarm.alarm_code}
              </div>
              <h2>{selected.alarm.description}</h2>
              <div className="drawer-chips">
                <Chips row={selected} />
              </div>
              <button
                aria-label="Close"
                className="icon-btn"
                onClick={() => setSelectedId(null)}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="drawer-body">
              <div className="stat-strip">
                <div>
                  <div className="label">Est. loss</div>
                  <div className="value">
                    {formatMwh(selected.loss)} <span>MWh</span>
                  </div>
                </div>
                <div>
                  <div className="label">Downtime</div>
                  <div className="value">{formatDuration(selected.downtimeMinutes)}</div>
                </div>
                <div>
                  <div className="label">Pattern</div>
                  <div className="value">
                    {selected.patternCount} <span>alarms / 60d</span>
                  </div>
                </div>
              </div>

              <dl className="kv">
                <div>
                  <dt>Incident</dt>
                  <dd>{selected.alarm.alarm_id}</dd>
                </div>
                <div>
                  <dt>Started</dt>
                  <dd>{formatDate(selected.alarm.timestamp)}</dd>
                </div>
                <div>
                  <dt>Deadline</dt>
                  <dd>
                    {formatDate(selected.deadline)}
                    {selected.overdue ? " · overdue" : ""}
                  </dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{selected.owner ?? <span className="muted">Unassigned</span>}</dd>
                </div>
                <div>
                  <dt>Team</dt>
                  <dd>{selected.category.team}</dd>
                </div>
                <div>
                  <dt>{selected.status === "Resolved" ? "Time to resolve" : "Open for"}</dt>
                  <dd>
                    {selected.status === "Resolved"
                      ? formatDuration(selected.downtimeMinutes)
                      : formatDuration(
                          (now - new Date(selected.alarm.timestamp).getTime()) / 60_000,
                        )}
                  </dd>
                </div>
                <div>
                  <dt>Score</dt>
                  <dd>
                    {selected.priority.score} · {selected.priority.rank} ·{" "}
                    {selected.recurrence} matching alarms
                  </dd>
                </div>
              </dl>

              {selected.incident?.notes || selected.alarm.resolution_notes ? (
                <div className="note-box">
                  {selected.incident?.notes ?? selected.alarm.resolution_notes}
                </div>
              ) : null}

              <div className="drawer-section">
                <h4>Probable cause</h4>
                <p>{selected.suggestion.cause}</p>
                <p className="small muted" style={{ marginTop: 6 }}>
                  {selected.suggestion.evidence}{" "}
                  {selected.patternCount > 1
                    ? `Recurrence: ${selected.patternCount} alarms in 60 days.`
                    : "No established recurrence pattern yet."}
                </p>
              </div>

              <div className="drawer-section">
                <h4>Workflow</h4>
                <div className="action-row">
                  {selected.status !== "Resolved" ? (
                    <>
                      {selected.status === "New" || selected.status === "Assigned" ? (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={isPending}
                          onClick={() => runStatus("Acknowledged")}
                          type="button"
                        >
                          Start work
                        </button>
                      ) : null}
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={isPending}
                        onClick={() => runStatus("Resolved")}
                        type="button"
                      >
                        Mark resolved
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-sm"
                      disabled={isPending}
                      onClick={() => runStatus("Active")}
                      type="button"
                    >
                      Reopen
                    </button>
                  )}
                  {isPending ? <span className="small muted">Saving…</span> : null}
                </div>
              </div>

              <div className="drawer-section">
                <h4>Assignment</h4>
                <AlarmUpdateForm
                  key={`${selected.alarm.alarm_id}-${selected.alarm.updated_at}`}
                  alarm={selected.alarm}
                />
              </div>

              <div className="drawer-section">
                <h4>
                  {selected.incident ? "Work order" : "Create a work order"}
                  {selected.incident ? (
                    <span className="small muted">
                      {" "}
                      · {selected.incident.status}
                    </span>
                  ) : null}
                </h4>
                <WorkOrderForm
                  key={`${selected.alarm.alarm_id}-${selected.incident?.id ?? "new"}-${
                    selected.incident?.updated_at ?? ""
                  }`}
                  alarm={selected.alarm}
                  incident={selected.incident}
                />
              </div>

              {selected.alarm.confirmed_root_cause ? (
                <div className="drawer-section">
                  <h4>Confirmed cause</h4>
                  <p>{selected.alarm.confirmed_root_cause}</p>
                </div>
              ) : null}

              <p className="footnote">
                Estimate uses alarm downtime and recorded turbine output. Suggestions are
                rule-based and advisory.
              </p>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
