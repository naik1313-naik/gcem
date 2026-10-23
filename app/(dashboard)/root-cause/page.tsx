import Link from "next/link";

import { RootCausePicker } from "@/components/console/root-cause-picker";
import { requireUser } from "@/lib/auth";
import { suggestRootCause } from "@/lib/alarm-logic";
import {
  SLA_HOURS,
  categoryForAlarm,
  downtimeHours,
  estimatedMwh,
  formatDate,
  formatDuration,
  formatMwh,
  incidentForAlarm,
  patternAlarms,
  priorityForAlarm,
  recurrenceGroups,
  severityClass,
  statusClass,
  workflowStatus,
} from "@/lib/console";
import { EMPTY_FILTERS, listAlarms } from "@/lib/db/alarms";
import { listIncidents } from "@/lib/db/incidents";
import type { SearchParams } from "@/lib/filters";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Root cause workbench · WindSage",
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function RootCausePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireUser();
  const params = await searchParams;
  const [alarms, incidents] = await Promise.all([
    listAlarms(EMPTY_FILTERS, 2000),
    listIncidents(200),
  ]);
  const now = Date.now();
  const groups = recurrenceGroups(alarms, now);

  // Pre-compute recurrence counts to avoid O(n^2) filtering
  const recurrenceCounts = new Map<string, number>();
  alarms.forEach((alarm) => {
    const key = `${alarm.turbine_id}|${alarm.alarm_code}`;
    recurrenceCounts.set(key, (recurrenceCounts.get(key) ?? 0) + 1);
  });

  const selectedId = first(params.alarm);
  const ranked = alarms
    .map((alarm) => {
      const recurrence = recurrenceCounts.get(`${alarm.turbine_id}|${alarm.alarm_code}`) ?? 1;
      return { alarm, priority: priorityForAlarm(alarm, recurrence), recurrence };
    })
    .sort((a, b) => {
      const aResolved = a.alarm.status === "Resolved" ? 1 : 0;
      const bResolved = b.alarm.status === "Resolved" ? 1 : 0;
      if (aResolved !== bResolved) return aResolved - bResolved;
      if (b.priority.score !== a.priority.score) return b.priority.score - a.priority.score;
      return (
        new Date(b.alarm.timestamp).getTime() - new Date(a.alarm.timestamp).getTime()
      );
    });

  const selected =
    ranked.find((entry) => entry.alarm.alarm_id === selectedId)?.alarm ??
    ranked[0]?.alarm ??
    null;

  if (!selected) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Root cause workbench</h1>
            <p className="page-sub">
              DMAIC view built from the alarm history. Hypotheses are suggestions, not confirmed
              faults.
            </p>
          </div>
        </div>
        <div className="panel">
          <div className="empty">
            <b>No incidents</b>
            There is no alarm history to analyse.
          </div>
        </div>
      </>
    );
  }

  const category = categoryForAlarm(selected);
  const recurrence = recurrenceCounts.get(`${selected.turbine_id}|${selected.alarm_code}`) ?? 1;
  const suggestion = suggestRootCause({ ...selected, recurrence });
  const priority = priorityForAlarm(selected, recurrence);
  const incident = incidentForAlarm(incidents, selected.alarm_id);
  const status = workflowStatus(selected, incident);
  const pattern = groups.find(
    (group) => group.turbine === selected.turbine_id && group.category === category.id,
  );
  const patternItems = patternAlarms(selected, alarms, now).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const sameCode = patternItems.filter((alarm) => alarm.alarm_code === selected.alarm_code).length;
  const patternLoss = patternItems.reduce((total, alarm) => total + estimatedMwh(alarm), 0);
  const patternDowntime = patternItems.reduce(
    (total, alarm) => total + downtimeHours(alarm) * 60,
    0,
  );
  const sortedTimes = [...patternItems]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((alarm) => new Date(alarm.timestamp).getTime());
  let gapTotal = 0;
  for (let index = 1; index < sortedTimes.length; index += 1) {
    gapTotal += (sortedTimes[index] - sortedTimes[index - 1]) / 86_400_000;
  }
  const avgGap = sortedTimes.length > 1 ? gapTotal / (sortedTimes.length - 1) : 0;
  const relatedCodes = new Map<string, number>();
  patternItems.forEach((alarm) => {
    relatedCodes.set(alarm.alarm_code, (relatedCodes.get(alarm.alarm_code) ?? 0) + 1);
  });
  const related = [...relatedCodes.entries()]
    .filter(([code]) => code !== selected.alarm_code)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => `${code} ×${count}`)
    .join(", ");

  const categoryByAlarm = new Map(
    alarms.map((alarm) => [alarm.alarm_id, categoryForAlarm(alarm).id] as const),
  );
  const categoryResolved = incidents.filter(
    (item) =>
      item.status === "Resolved" &&
      item.resolved_at &&
      categoryByAlarm.get(item.alarm_id ?? "") === category.id,
  );
  const categoryMttr = categoryResolved.length
    ? categoryResolved.reduce(
        (total, item) =>
          total +
          (new Date(item.resolved_at as string).getTime() -
            new Date(item.created_at).getTime()) /
            3_600_000,
        0,
      ) / categoryResolved.length
    : null;

  const sla = SLA_HOURS[selected.severity];
  const owner = incident?.technician ?? selected.technician ?? null;
  const options = ranked.slice(0, 300).map(({ alarm }) => ({
    id: alarm.alarm_id,
    label: `${alarm.turbine_id} · ${alarm.alarm_code} · ${alarm.status} · ${formatDate(
      alarm.timestamp,
    )}`,
  }));
  if (!options.some((option) => option.id === selected.alarm_id)) {
    options.unshift({
      id: selected.alarm_id,
      label: `${selected.turbine_id} · ${selected.alarm_code} · ${selected.status} · ${formatDate(
        selected.timestamp,
      )}`,
    });
  }

  const evidence = [
    `${patternItems.length} alarms in this turbine/category in the last 60 days.`,
    `${sameCode} of them were ${selected.alarm_code}.`,
    avgGap
      ? `Average interval between alarms is ${avgGap.toFixed(1)} days.`
      : "This is the first alarm of its category on this turbine in the window.",
    `Estimated loss on this pattern: ${formatMwh(patternLoss)} MWh.`,
  ];
  if (related) evidence.push(`Other codes in the same category: ${related}.`);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Root cause workbench</h1>
          <p className="page-sub">
            DMAIC view built from the alarm history. Hypotheses are suggestions, not confirmed
            faults.
          </p>
        </div>
        <div className="page-meta">
          {pattern ? `${pattern.count} alarms in this pattern` : "No established pattern yet"}
        </div>
      </div>

      <RootCausePicker options={options} selectedId={selected.alarm_id} />

      <div className="incident-strip">
        <div className="strip-cell">
          <div className="strip-label">Priority</div>
          <div className="strip-value">
            <span className={`rank rank-${priority.rank.toLowerCase()}`}>{priority.rank}</span>{" "}
            <span>score {priority.score}</span>
          </div>
        </div>
        <div className="strip-cell">
          <div className="strip-label">Estimated loss</div>
          <div className="strip-value">
            {formatMwh(estimatedMwh(selected))} <span>MWh</span>
          </div>
        </div>
        <div className="strip-cell">
          <div className="strip-label">Pattern · 60 days</div>
          <div className="strip-value">
            {patternItems.length} <span>alarms, {pattern?.active ?? 0} open</span>
          </div>
        </div>
        <div className="strip-cell">
          <div className="strip-label">Owner</div>
          <div className="strip-value">
            {owner ?? <span className="muted">Unassigned</span>} <span>{category.team}</span>
          </div>
        </div>
      </div>

      <div className="dmaic-grid">
        <section className="dmaic-card">
          <div className="dmaic-head">
            <span className="dmaic-letter">D</span>
            <h3>Define</h3>
            <span className="hint">scope</span>
          </div>
          <div className="dmaic-body">
            <dl className="kv">
              <div>
                <dt>Incident</dt>
                <dd>{selected.alarm_id}</dd>
              </div>
              <div>
                <dt>Alarm</dt>
                <dd>
                  {selected.alarm_code} · {selected.description}
                </dd>
              </div>
              <div>
                <dt>Turbine</dt>
                <dd>
                  {selected.turbine_id} · {category.label}
                </dd>
              </div>
              <div>
                <dt>Severity</dt>
                <dd>
                  <span className={`chip chip-${severityClass(selected.severity)}`}>
                    {selected.severity}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Detected</dt>
                <dd>{formatDate(selected.timestamp)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`chip chip-${statusClass(status)}`}>{status}</span>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="dmaic-card">
          <div className="dmaic-head">
            <span className="dmaic-letter">M</span>
            <h3>Measure</h3>
            <span className="hint">quantify</span>
          </div>
          <div className="dmaic-body">
            <dl className="kv">
              <div>
                <dt>Alarms in pattern</dt>
                <dd>{patternItems.length} in 60 days</dd>
              </div>
              <div>
                <dt>Pattern downtime</dt>
                <dd>{formatDuration(patternDowntime)}</dd>
              </div>
              <div>
                <dt>Pattern est. loss</dt>
                <dd>{formatMwh(patternLoss)} MWh</dd>
              </div>
              <div>
                <dt>This incident</dt>
                <dd>
                  {formatDuration(downtimeHours(selected) * 60)} ·{" "}
                  {estimatedMwh(selected).toFixed(1)} MWh
                </dd>
              </div>
              <div>
                <dt>Category MTTR</dt>
                <dd>
                  {categoryMttr === null ? "No completed history" : formatDuration(categoryMttr * 60)}
                </dd>
              </div>
              <div>
                <dt>SLA</dt>
                <dd>{sla} hours from detection</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="dmaic-card">
          <div className="dmaic-head">
            <span className="dmaic-letter">A</span>
            <h3>Analyze</h3>
            <span className="hint">hypothesis</span>
          </div>
          <div className="dmaic-body">
            <p className="hypothesis">{suggestion.cause}</p>
            <ul className="evidence">
              {evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="dmaic-card">
          <div className="dmaic-head">
            <span className="dmaic-letter">I</span>
            <h3>Improve</h3>
            <span className="hint">action</span>
          </div>
          <div className="dmaic-body">
            <ul className="checklist">
              <li>{suggestion.action}</li>
              <li>
                Assign to {category.team}. Deadline is {sla} hours after detection unless the site
                sets a different SLA.
              </li>
              <li>Record the confirmed root cause and parts used in the work order.</li>
            </ul>
            <div className="note-box">
              Suggested confidence: {suggestion.confidence}%. Verify on site before committing
              parts or crane time.
            </div>
          </div>
        </section>

        <section className="dmaic-card" style={{ gridColumn: "1 / -1" }}>
          <div className="dmaic-head">
            <span className="dmaic-letter">C</span>
            <h3>Control</h3>
            <span className="hint">verify and watch</span>
          </div>
          <div className="dmaic-body">
            <div className="grid-2" style={{ marginBottom: 0 }}>
              <div>
                <ul className="checklist verify">
                  <li>Confirm the suggested cause against the physical inspection.</li>
                  <li>Watch {selected.turbine_id} · {category.label} for 14 days after closure.</li>
                  <li>If the same pattern returns, reopen with its history intact.</li>
                </ul>
              </div>
              <div>
                <p className="hypothesis" style={{ marginBottom: 8 }}>
                  After closure, keep the alarm in the same pattern instead of opening a new
                  unrelated incident.
                </p>
                <div className="note-box" style={{ marginTop: 0 }}>
                  Control fails if the same alarm returns inside the watch window. Reopen the
                  original incident and keep the audit trail.
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h3>Latest occurrences in this pattern</h3>
            <span className="hint">6 most recent</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Code</th>
                  <th className="num">Downtime</th>
                  <th className="num">Est. MWh</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {patternItems.slice(0, 6).map((alarm) => {
                  const alarmIncident = incidentForAlarm(incidents, alarm.alarm_id);
                  const alarmStatus = workflowStatus(alarm, alarmIncident);
                  return (
                    <tr key={alarm.alarm_id}>
                      <td className="muted">{formatDate(alarm.timestamp)}</td>
                      <td>
                        <Link
                          className="strong"
                          href={`/root-cause?alarm=${encodeURIComponent(alarm.alarm_id)}`}
                        >
                          {alarm.alarm_code}
                        </Link>
                      </td>
                      <td className="num">{formatDuration(downtimeHours(alarm) * 60)}</td>
                      <td className="num">{estimatedMwh(alarm).toFixed(1)}</td>
                      <td>
                        <span className={`chip chip-${statusClass(alarmStatus)}`}>
                          {alarmStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {patternItems.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty">
                        <b>No history</b>
                        This is the first alarm in the pattern.
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Method and assumptions</h3>
            <span className="hint">read before quoting numbers</span>
          </div>
          <div className="panel-body">
            <div className="analysis-foot">
              <p className="hypothesis">
                Lost production per alarm = downtime × recorded turbine output. LPF is estimated
                lost energy divided by potential production in the same window.
              </p>
              <p>
                <b>Dataset:</b> synthetic SCADA-style alarms across the North Ridge demo fleet.
                No real turbine, site or operator data is used.
              </p>
              <p>
                <b>Model:</b> recurrence counting plus a rule set per alarm code. No trained model
                sits behind the ranking.
              </p>
              <p>
                <b>Limits:</b> output and SLA assumptions are demo values. A real pilot needs
                turbine power curves, maintenance records and an agreed LPF definition.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
