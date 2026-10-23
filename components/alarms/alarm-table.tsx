import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { priorityScore } from "@/lib/alarm-logic";
import type { AlarmRecord } from "@/lib/types";

const formatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function alarmHref(queryString: string, alarmId: string) {
  const params = new URLSearchParams(queryString);
  params.set("alarm", alarmId);
  return `/alarms?${params.toString()}`;
}

export function AlarmTable({
  alarms,
  selectedId,
  queryString,
  recurrenceSource,
}: {
  alarms: AlarmRecord[];
  selectedId?: string;
  queryString: string;
  recurrenceSource?: AlarmRecord[];
}) {
  if (!alarms.length) {
    return (
      <EmptyState
        title="No alarms found"
        description="No alarm records match the current filters. Reset the filters or import a CSV to add alarm history."
      />
    );
  }

  const source = recurrenceSource ?? alarms;
  const recurrence = new Map<string, number>();
  source.forEach((alarm) => {
    const key = `${alarm.turbine_id}|${alarm.alarm_code}`;
    recurrence.set(key, (recurrence.get(key) ?? 0) + 1);
  });

  return (
    <div className="table-wrap bg-white">
      <table className="data-table">
        <thead>
          <tr>
            <th>Alarm</th>
            <th>Turbine</th>
            <th>Severity</th>
            <th>Priority</th>
            <th>Timestamp (UTC)</th>
            <th>Status</th>
            <th>Suggested root cause</th>
          </tr>
        </thead>
        <tbody>
          {alarms.map((alarm) => {
            const score = priorityScore({
              ...alarm,
              recurrence: recurrence.get(`${alarm.turbine_id}|${alarm.alarm_code}`) ?? 1,
            });
            return (
              <tr
                key={alarm.id}
                className={selectedId === alarm.alarm_id ? "bg-teal-50/70" : undefined}
              >
                <td>
                  <Link
                    href={alarmHref(queryString, alarm.alarm_id)}
                    className="font-bold text-teal-700 hover:text-teal-900 hover:underline"
                  >
                    {alarm.alarm_id}
                  </Link>
                  <p className="mt-0.5 max-w-[240px] truncate text-[0.68rem] text-slate-400">
                    {alarm.alarm_code} · {alarm.description}
                  </p>
                </td>
                <td className="font-semibold text-slate-800">{alarm.turbine_id}</td>
                <td>
                  <SeverityBadge severity={alarm.severity} />
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-right text-xs font-bold text-slate-700">{score}</span>
                    <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-teal-500"
                        style={{ width: `${score}%` }}
                      />
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap text-xs text-slate-500">
                  {formatter.format(new Date(alarm.timestamp))}
                </td>
                <td>
                  <StatusBadge status={alarm.status} />
                </td>
                <td className="max-w-[240px] text-xs leading-5 text-slate-500">
                  {alarm.suggested_root_cause ?? "Pending rule evaluation"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
