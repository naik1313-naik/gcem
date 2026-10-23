import clsx from "clsx";

import type { AlarmStatus, IncidentStatus, Severity } from "@/lib/types";

const severityStyles: Record<Severity, string> = {
  Critical: "bg-red-50 text-red-700 ring-red-200",
  High: "bg-amber-50 text-amber-700 ring-amber-200",
  Medium: "bg-sky-50 text-sky-700 ring-sky-200",
  Low: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const statusStyles: Record<string, string> = {
  Active: "bg-red-50 text-red-700 ring-red-200",
  Acknowledged: "bg-amber-50 text-amber-700 ring-amber-200",
  Resolved: "bg-slate-100 text-slate-600 ring-slate-200",
  Open: "bg-red-50 text-red-700 ring-red-200",
  Assigned: "bg-sky-50 text-sky-700 ring-sky-200",
  "In Progress": "bg-teal-50 text-teal-700 ring-teal-200",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={clsx(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.68rem] font-bold ring-1 ring-inset",
        severityStyles[severity],
      )}
    >
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: AlarmStatus | IncidentStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.68rem] font-bold ring-1 ring-inset",
        statusStyles[status] ?? "bg-slate-100 text-slate-600 ring-slate-200",
      )}
    >
      {status}
    </span>
  );
}
