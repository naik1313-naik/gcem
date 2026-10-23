import { RotateCcw, Search } from "lucide-react";
import Link from "next/link";

import type { AlarmFilters, Turbine } from "@/lib/types";
import { ALARM_STATUSES, SEVERITIES } from "@/lib/types";

export function AlarmFiltersForm({
  filters,
  turbines,
}: {
  filters: AlarmFilters;
  turbines: Turbine[];
}) {
  return (
    <form method="get" action="/alarms" className="surface p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <label className="label" htmlFor="turbine">
            Turbine
          </label>
          <select id="turbine" name="turbine" defaultValue={filters.turbine} className="field">
            <option value="">All turbines</option>
            {turbines.map((turbine) => (
              <option key={turbine.id} value={turbine.id}>
                {turbine.id} · {turbine.site ?? "Site"}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-3">
          <label className="label" htmlFor="q">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={filters.q}
            placeholder="Alarm ID, code, description"
            className="field"
          />
        </div>

        <div className="lg:col-span-2">
          <label className="label" htmlFor="exactDate">
            Exact date (UTC)
          </label>
          <input
            id="exactDate"
            name="exactDate"
            type="date"
            defaultValue={filters.exactDate}
            className="field"
          />
        </div>

        <div className="lg:col-span-2">
          <label className="label" htmlFor="from">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={filters.from} className="field" />
        </div>

        <div className="lg:col-span-2">
          <label className="label" htmlFor="to">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={filters.to} className="field" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <fieldset className="lg:col-span-3">
          <legend className="label">Severity</legend>
          <div className="flex flex-wrap gap-2">
            {SEVERITIES.map((severity) => (
              <label
                key={severity}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 has-checked:border-teal-300 has-checked:bg-teal-50 has-checked:text-teal-800"
              >
                <input
                  type="checkbox"
                  name="severity"
                  value={severity}
                  defaultChecked={filters.severities.includes(severity)}
                  className="h-3.5 w-3.5 accent-teal-600"
                />
                {severity}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="lg:col-span-3">
          <legend className="label">Status</legend>
          <div className="flex flex-wrap gap-2">
            {ALARM_STATUSES.map((status) => (
              <label
                key={status}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 has-checked:border-teal-300 has-checked:bg-teal-50 has-checked:text-teal-800"
              >
                <input
                  type="checkbox"
                  name="status"
                  value={status}
                  defaultChecked={filters.statuses.includes(status)}
                  className="h-3.5 w-3.5 accent-teal-600"
                />
                {status}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="lg:col-span-2">
          <label className="label" htmlFor="sort">
            Sort by
          </label>
          <select id="sort" name="sort" defaultValue={filters.sort} className="field">
            <option value="newest">Newest first</option>
            <option value="priority">Priority score</option>
          </select>
        </div>

        <div className="flex items-end gap-2 lg:col-span-4 lg:justify-end">
          <Link href="/alarms" className="btn-secondary">
            <RotateCcw className="h-4 w-4" />
            Reset
          </Link>
          <button type="submit" className="btn-primary">
            <Search className="h-4 w-4" />
            Apply filters
          </button>
        </div>
      </div>

      <p className="mt-3 text-[0.68rem] text-slate-500">
        Exact date takes precedence over the range. Range end dates are inclusive and all dates use
        UTC.
      </p>
    </form>
  );
}
