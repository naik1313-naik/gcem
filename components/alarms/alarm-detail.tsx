import { ArrowUpRight, ClipboardCheck, Gauge, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";

import { AlarmUpdateForm } from "@/components/alarms/alarm-update-form";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { RiskGauge } from "@/components/risk-gauge";
import type { RootCauseSuggestion, RiskResult } from "@/lib/alarm-logic";
import type { AlarmRecord } from "@/lib/types";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function Reading({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <p className="text-[0.62rem] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-base font-bold text-slate-800">
        {value === null || !Number.isFinite(value) ? "—" : value.toFixed(1)}
        <span className="ml-1 text-[0.65rem] font-semibold text-slate-400">{unit}</span>
      </p>
    </div>
  );
}

export function AlarmDetail({
  alarm,
  recurrence,
  suggestion,
  risk,
  priority,
}: {
  alarm: AlarmRecord;
  recurrence: number;
  suggestion: RootCauseSuggestion;
  risk: RiskResult;
  priority: number;
}) {
  return (
    <section className="space-y-4">
      <div className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
                {alarm.alarm_id}
              </h2>
              <SeverityBadge severity={alarm.severity} />
              <StatusBadge status={alarm.status} />
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              {alarm.turbine_id} · {alarm.alarm_code} · {alarm.description}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {dateFormatter.format(new Date(alarm.timestamp))} UTC · {alarm.duration_min.toFixed(0)}{" "}
              min duration · {recurrence} matching alarm(s)
            </p>
          </div>
          <Link
            href={`/maintenance?alarm=${encodeURIComponent(alarm.alarm_id)}`}
            className="btn-secondary text-xs"
          >
            <Wrench className="h-4 w-4" />
            Create work order
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Reading label="Vibration" value={alarm.vibration_mm_s} unit="mm/s" />
          <Reading label="Temperature" value={alarm.temperature_c} unit="°C" />
          <Reading label="Hydraulic pressure" value={alarm.hydraulic_pressure_bar} unit="bar" />
          <Reading label="Estimated power" value={alarm.estimated_power_kw} unit="kW" />
        </div>
      </div>

      <div className="surface p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-teal-50 p-2.5 text-teal-700 ring-1 ring-inset ring-teal-100">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-teal-700">
              Suggested root cause · rule match {suggestion.confidence}%
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">{suggestion.cause}</h3>
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
          <strong className="text-slate-800">Evidence:</strong> {suggestion.evidence}
        </p>
        <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-600">
          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
          <span>
            <strong className="text-slate-800">Recommended inspection:</strong> {suggestion.action}
          </span>
        </p>
        <p className="mt-3 text-[0.68rem] text-slate-400">
          Transparent rule-based suggestion, not a validated diagnosis. Human review is required.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="surface flex flex-col items-center justify-center p-5">
          <p className="mb-2 flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
            <Gauge className="h-3.5 w-3.5" />
            Failure-risk indicator
          </p>
          <RiskGauge score={risk.score} category={risk.category} />
          <p className="mt-3 text-center text-[0.68rem] leading-5 text-slate-400">
            Based on severity, recurrence, sensor thresholds, and duration.
          </p>
        </div>
        <div className="surface flex flex-col justify-between p-5">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
              Priority score
            </p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-extrabold text-slate-900">{priority}</span>
              <span className="mb-1 text-sm font-semibold text-slate-400">/ 100</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {alarm.severity} severity · {recurrence} recurrence event(s) ·{" "}
              {alarm.duration_min.toFixed(0)} min duration · simulated availability impact.
            </p>
          </div>
          <Link
            href={`/insights?alarm=${encodeURIComponent(alarm.alarm_id)}`}
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900"
          >
            Tune priority weights <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-teal-700" />
          <h3 className="text-sm font-bold text-slate-800">Alarm record update</h3>
        </div>
        <AlarmUpdateForm alarm={alarm} />
      </div>
    </section>
  );
}
