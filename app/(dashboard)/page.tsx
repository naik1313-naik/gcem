import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { EMPTY_FILTERS, listAlarms } from "@/lib/db/alarms";
import { listIncidents } from "@/lib/db/incidents";
import {
  alarmDeadline,
  categoryLoss,
  consoleStats,
  formatDate,
  formatDuration,
  formatMwh,
  incidentForAlarm,
  isOverdue,
  priorityForAlarm,
  recurrenceForAlarm,
  recurrenceGroups,
  workflowStatus,
} from "@/lib/console";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fleet overview · WindSage",
};

export default async function OverviewPage() {
  await requireUser();
  const [alarms, incidents] = await Promise.all([
    listAlarms(EMPTY_FILTERS, 2000),
    listIncidents(200),
  ]);
  const now = Date.now();
  const stats = consoleStats(alarms, incidents, now);
  const groups = recurrenceGroups(alarms, now);

  const attention = alarms
    .filter((alarm) => alarm.status !== "Resolved")
    .map((alarm) => {
      const recurrence = recurrenceForAlarm(alarm, alarms);
      const priority = priorityForAlarm(alarm, recurrence);
      const incident = incidentForAlarm(incidents, alarm.alarm_id);
      return {
        alarm,
        incident,
        priority,
        recurrence,
        overdue: isOverdue(alarm, incident, now),
        deadline: alarmDeadline(alarm, incident),
      };
    })
    .sort((a, b) => b.priority.score - a.priority.score)
    .slice(0, 6);

  const categories = categoryLoss(alarms, now, 30);
  const maxLoss = Math.max(1, ...categories.map((category) => category.loss));
  const totalLoss = categories.reduce((total, category) => total + category.loss, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Fleet overview</h1>
          <p className="page-sub">
            Alarm volume, estimated production loss and open work. Synthetic demo data, last 90
            days.
          </p>
        </div>
        <div className="page-meta">
          {alarms.length} alarms · data through <b>{formatDate(now)}</b>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Open incidents</div>
          <div className="kpi-value">{stats.open}</div>
          <div className="kpi-sub">
            <span className={stats.criticalOpen ? "warn" : "ok"}>
              {stats.criticalOpen} critical
            </span>{" "}
            · {stats.awaiting} awaiting verification
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Recurring patterns</div>
          <div className="kpi-value">{stats.recurring}</div>
          <div className="kpi-sub">{stats.recurringOpen} active alarms inside them</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Est. loss · 30 days</div>
          <div className="kpi-value">
            {formatMwh(stats.loss30)}
            <small>MWh</small>
          </div>
          <div className="kpi-sub">LPF {stats.lpf30.toFixed(2)}% of potential</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Mean time to resolve</div>
          <div className="kpi-value">
            {stats.mttr === null ? "—" : formatDuration(stats.mttr * 60)}
          </div>
          <div className="kpi-sub">{stats.mttrCount} incidents completed</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Past deadline</div>
          <div className="kpi-value">{stats.overdue}</div>
          <div className="kpi-sub">
            <span className={stats.overdue ? "warn" : "ok"}>{stats.criticalOverdue} critical</span>{" "}
            of {stats.active} active
          </div>
        </div>
      </div>

      {alarms.length === 0 ? (
        <section className="panel">
          <div className="empty">
            <b>No alarm history yet</b>
            Apply the Supabase migrations or import a CSV to populate the console.
          </div>
        </section>
      ) : (
        <>
          <div className="grid-2">
            <section className="panel">
              <div className="panel-head">
                <h3>Estimated loss by category</h3>
                <span className="hint">Last 30 days · estimated energy gap</span>
              </div>
              <div className="panel-body">
                <div className="bars">
                  {categories.length ? (
                    categories.map((category) => (
                      <div className="bar-row" key={category.id}>
                        <div className="bar-name">
                          {category.label}
                          <span>
                            {category.count} alarm{category.count === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{ width: `${Math.max(2, (category.loss / maxLoss) * 100)}%` }}
                          />
                        </div>
                        <div className="bar-value">
                          {formatMwh(category.loss)} <span>MWh</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty">
                      <b>No alarms in the window</b>
                      Nothing to estimate.
                    </div>
                  )}
                </div>
                {categories.length ? (
                  <div className="bar-total">
                    <span>Total estimated loss</span>
                    <span>
                      <b>{formatMwh(totalLoss)} MWh</b> · {stats.lpf30.toFixed(2)}% LPF
                    </span>
                  </div>
                ) : null}
                <div className="legend">
                  <span>estimated energy gap</span>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h3>Needs attention</h3>
                <span className="hint">Active, ranked by impact</span>
              </div>
              <div className="attention">
                {attention.length ? (
                  attention.map(({ alarm, incident, priority, overdue, deadline }) => (
                    <Link
                      className="attention-item"
                      href={`/incidents?alarm=${encodeURIComponent(alarm.alarm_id)}`}
                      key={alarm.alarm_id}
                    >
                      <span className={`rank rank-${priority.rank.toLowerCase()}`}>
                        {priority.rank}
                      </span>
                      <div className="attention-main">
                        <div className="attention-title">{alarm.description}</div>
                        <div className="attention-meta">
                          {alarm.turbine_id} · {alarm.alarm_code} ·{" "}
                          {incident?.technician ?? alarm.technician ?? "Unassigned"} · score{" "}
                          {priority.score}
                        </div>
                      </div>
                      <div className={`attention-due${overdue ? " overdue" : ""}`}>
                        {overdue
                          ? `Overdue ${formatDuration((now - deadline) / 60_000)}`
                          : `in ${formatDuration((deadline - now) / 60_000)}`}
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="empty">
                    <b>Nothing waiting</b>
                    Every active alarm has been handled.
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-head">
              <h3>Recurring patterns</h3>
              <span className="hint">3+ alarms on one turbine and category in 60 days</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Turbine / category</th>
                    <th className="num">Alarms</th>
                    <th className="num">Active</th>
                    <th>Last alarm</th>
                    <th className="num">Est. MWh</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {groups.slice(0, 6).map((group) => (
                    <tr key={group.key}>
                      <td className="pattern-cell">
                        <div className="pattern-title">
                          {group.turbine} · {group.categoryLabel}
                        </div>
                        <div className="pattern-sub">{group.topCode} most frequent</div>
                      </td>
                      <td className="num">{group.count}</td>
                      <td className="num">{group.active}</td>
                      <td className="muted">{formatDate(group.lastAt)}</td>
                      <td className="num">{formatMwh(group.loss)}</td>
                      <td>
                        <Link
                          className="btn btn-sm"
                          href={`/incidents?turbine=${encodeURIComponent(group.turbine)}&category=${encodeURIComponent(group.category)}`}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {groups.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty">
                          <b>No pattern crosses the threshold</b>
                          Three alarms on one turbine and category in 60 days flags a pattern.
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span>Open the Recurrence tab for gaps, trend and full history.</span>
              <span>Estimate only</span>
            </div>
          </section>
        </>
      )}

      <p className="footnote">
        Estimated loss is based on alarm downtime and recorded turbine output. Root-cause
        suggestions, risk and priority scores are advisory; no live SCADA or turbine control is
        connected.{" "}
        {alarms.some((alarm) => alarm.status === "Resolved")
          ? `${alarms.filter((alarm) => workflowStatus(alarm, incidentForAlarm(incidents, alarm.alarm_id)) === "Resolved").length} alarms are resolved.`
          : ""}
      </p>
    </>
  );
}
