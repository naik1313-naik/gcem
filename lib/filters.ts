import {
  ALARM_SORTS,
  ALARM_STATUSES,
  SEVERITIES,
  type AlarmFilters,
  type AlarmSort,
  type AlarmStatus,
  type Severity,
} from "@/lib/types";

export type SearchParams = Record<string, string | string[] | undefined>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function list(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? value.split(",") : [];
  return values.map((item) => item.trim()).filter(Boolean);
}

export function isValidDateInput(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseAlarmFilters(params: SearchParams): AlarmFilters {
  const severities = [...new Set(list(params.severity))].filter((item): item is Severity =>
    (SEVERITIES as readonly string[]).includes(item),
  );
  const statuses = [...new Set(list(params.status))].filter((item): item is AlarmStatus =>
    (ALARM_STATUSES as readonly string[]).includes(item),
  );

  const exactDate = first(params.exactDate);
  const from = first(params.from);
  const to = first(params.to);
  const sortValue = first(params.sort);
  const sort = (ALARM_SORTS as readonly string[]).includes(sortValue)
    ? (sortValue as AlarmSort)
    : "newest";

  return {
    turbine: first(params.turbine).trim().slice(0, 32),
    severities,
    statuses,
    q: first(params.q).trim().slice(0, 120),
    exactDate: isValidDateInput(exactDate) ? exactDate : "",
    from: isValidDateInput(from) ? from : "",
    to: isValidDateInput(to) ? to : "",
    sort,
  };
}

export interface DateWindow {
  gte?: string;
  lt?: string;
}

function startOfUtcDay(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Exact-date filters win over a range. Range end dates are inclusive:
 * the upper bound is midnight at the start of the following UTC day.
 */
export function resolveDateWindow(filters: Pick<AlarmFilters, "exactDate" | "from" | "to">): DateWindow {
  if (filters.exactDate) {
    const start = startOfUtcDay(filters.exactDate);
    return { gte: start.toISOString(), lt: addUtcDays(start, 1).toISOString() };
  }

  if (!filters.from && !filters.to) return {};

  const from = filters.from || filters.to;
  const to = filters.to || filters.from;
  const start = startOfUtcDay(from <= to ? from : to);
  const end = startOfUtcDay(from <= to ? to : from);
  return { gte: start.toISOString(), lt: addUtcDays(end, 1).toISOString() };
}

export function hasActiveFilters(filters: AlarmFilters): boolean {
  return Boolean(
    filters.turbine ||
      filters.severities.length ||
      filters.statuses.length ||
      filters.q ||
      filters.exactDate ||
      filters.from ||
      filters.to,
  );
}

export function filtersToSearchParams(filters: AlarmFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.turbine) params.set("turbine", filters.turbine);
  filters.severities.forEach((severity) => params.append("severity", severity));
  filters.statuses.forEach((status) => params.append("status", status));
  if (filters.q) params.set("q", filters.q);
  if (filters.exactDate) params.set("exactDate", filters.exactDate);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.sort === "priority") params.set("sort", "priority");
  return params;
}

export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}
