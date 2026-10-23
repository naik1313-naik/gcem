"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";

import {
  DEFAULT_PRIORITY_WEIGHTS,
  priorityScore,
  type PriorityWeights,
} from "@/lib/alarm-logic";
import type { AlarmRecord } from "@/lib/types";

export function PriorityEngine({
  alarm,
  recurrence,
}: {
  alarm: AlarmRecord;
  recurrence: number;
}) {
  const [weights, setWeights] = useState<PriorityWeights>(DEFAULT_PRIORITY_WEIGHTS);
  const score = priorityScore({ ...alarm, recurrence }, weights);

  function update(key: keyof PriorityWeights, value: number) {
    setWeights((current) => ({ ...current, [key]: value }));
  }

  const controls: { key: keyof PriorityWeights; label: string; hint: string }[] = [
    { key: "severity", label: "Severity", hint: "Weight given to Critical/High alarms" },
    { key: "recurrence", label: "Recurrence", hint: "Repeat alarms on the same turbine" },
    { key: "duration", label: "Duration", hint: "How long the alarm remained active" },
    { key: "impact", label: "Operational impact", hint: "Simulated unavailable power" },
  ];

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        {controls.map((control) => (
          <label key={control.key} className="block">
            <span className="flex items-center justify-between text-xs font-bold text-slate-700">
              {control.label}
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[0.68rem] text-slate-500">
                {weights[control.key]}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={60}
              value={weights[control.key]}
              onChange={(event) => update(control.key, Number(event.target.value))}
              className="mt-2 w-full accent-teal-600"
            />
            <span className="mt-1 block text-[0.62rem] text-slate-400">{control.hint}</span>
          </label>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-xl bg-navy-950 px-5 py-4 text-white">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-teal-300">
            Configured priority
          </p>
          <p className="mt-1 text-4xl font-extrabold leading-none">
            {score}
            <span className="ml-1 text-sm font-semibold text-slate-400">/ 100</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWeights(DEFAULT_PRIORITY_WEIGHTS)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset weights
        </button>
      </div>

      <p className="mt-3 text-xs leading-6 text-slate-500">
        Why: {alarm.severity} severity, {recurrence} recurrence event(s),{" "}
        {alarm.duration_min.toFixed(0)}-minute duration, and simulated availability impact. Weights
        are normalized to 100, so the score stays comparable when settings change.
      </p>
    </div>
  );
}
