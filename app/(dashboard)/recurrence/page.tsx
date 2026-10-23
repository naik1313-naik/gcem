import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { formatDate, formatMwh, recurrenceGroups } from "@/lib/console";
import { EMPTY_FILTERS, listAlarms } from "@/lib/db/alarms";
import { listIncidents } from "@/lib/db/incidents";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Recurrence · WindSage",
};

export default async function RecurrencePage() {
  await requireUser();
  const [alarms, incidents] = await Promise.all([
    listAlarms(EMPTY_FILTERS, 2000),
    listIncidents(200),
  ]);
  const now = Date.now();
  const groups = recurrenceGroups(alarms, now);
  const alarmsInPatterns = groups.reduce((total, group) => total + group.count, 0);
  const repeatShare = alarms.length ? Math.round((alarmsInPatterns / alarms.length) * 100) : 0;
  const resolved = incidents.filter((incident) => incident.status === "Resolved").length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Recurrence</h1>
          <p className="page-sub">
            A pattern is the same category of alarm returning on the same turbine inside 60 days.
          </p>
        </div>
        <div className="page-meta">
          {groups.length} patterns · {repeatShare}% of alarms sit inside one
        </div>
      </div>

      <div className="note-box" style={{ margin: "0 0 14px" }}>
        Fix check: <b>{resolved}</b> work orders are currently resolved. Resolving an alarm does
        not erase its pattern history; a repeat inside the watch window stays attached to the same
        turbine and category.
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Patterns over threshold</h3>
          <span className="hint">Minimum 3 alarms · 60-day window · sorted by estimated loss</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Turbine / category</th>
                <th className="num">Alarms</th>
                <th className="num">Active</th>
                <th>Last alarm</th>
                <th className="num">Avg gap</th>
                <th className="num">Est. MWh</th>
                <th>Last 30 vs prior 30</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.key}>
                  <td className="pattern-cell">
                    <div className="pattern-title">
                      {group.turbine} · {group.categoryLabel}
                    </div>
                    <div className="pattern-sub">{group.topCode} most frequent</div>
                  </td>
                  <td className="num strong">{group.count}</td>
                  <td className="num">{group.active}</td>
                  <td className="muted">{formatDate(group.lastAt)}</td>
                  <td className="num">
                    {group.avgGap ? `${group.avgGap.toFixed(1)} d` : "—"}
                  </td>
                  <td className="num">{formatMwh(group.loss)}</td>
                  <td
                    className={
                      group.trend === "up"
                        ? "trend-up"
                        : group.trend === "down"
                          ? "trend-down"
                          : "trend-flat"
                    }
                  >
                    {group.trend === "up"
                      ? `▲ ${group.last30} vs ${group.prev30}`
                      : group.trend === "down"
                        ? `▼ ${group.last30} vs ${group.prev30}`
                        : `— ${group.last30} vs ${group.prev30}`}
                  </td>
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
                  <td colSpan={8}>
                    <div className="empty">
                      <b>No recurring patterns</b>
                      No turbine/category pair reached three alarms in 60 days.
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>Click a pattern to filter its incidents.</span>
          <span>Gap = time between consecutive alarms</span>
        </div>
      </div>

      <div className="note-box">
        Recurrence is counted on turbine and category, not on the exact alarm code. A gearbox
        oil-temperature alarm and a gearbox filter alarm on the same turbine belong to one
        pattern.
      </div>

      <p className="footnote">
        Pattern detail is calculated from {alarms.length} alarm records in a 60-day window.
        Estimated loss is advisory.
      </p>
    </>
  );
}
