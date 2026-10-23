import { describe, expect, it } from "vitest";

import {
  filtersToSearchParams,
  hasActiveFilters,
  parseAlarmFilters,
  resolveDateWindow,
  sanitizeSearchTerm,
} from "@/lib/filters";

describe("alarm filters", () => {
  it("normalizes turbine, search text, severity, and status filters", () => {
    const filters = parseAlarmFilters({
      turbine: " WT-03 ",
      q: "  VIB-201 ",
      severity: ["Critical", "High", "Bogus"],
      status: "Active",
    });

    expect(filters.turbine).toBe("WT-03");
    expect(filters.q).toBe("VIB-201");
    expect(filters.severities).toEqual(["Critical", "High"]);
    expect(filters.statuses).toEqual(["Active"]);
    expect(hasActiveFilters(filters)).toBe(true);
  });

  it("accepts comma-separated filter values from links", () => {
    const filters = parseAlarmFilters({ severity: "Critical,High", status: "Active,Resolved" });
    expect(filters.severities).toEqual(["Critical", "High"]);
    expect(filters.statuses).toEqual(["Active", "Resolved"]);
  });

  it("rejects invalid dates and unknown enum values", () => {
    const filters = parseAlarmFilters({
      exactDate: "2026-02-31",
      from: "not-a-date",
      to: "2026-10-23",
      severity: "Urgent",
    });
    expect(filters.exactDate).toBe("");
    expect(filters.from).toBe("");
    expect(filters.to).toBe("2026-10-23");
    expect(filters.severities).toEqual([]);
  });

  it("builds an exclusive next-day upper bound for an exact date", () => {
    expect(resolveDateWindow({ exactDate: "2026-10-23", from: "", to: "" })).toEqual({
      gte: "2026-10-23T00:00:00.000Z",
      lt: "2026-10-24T00:00:00.000Z",
    });
  });

  it("makes date ranges inclusive and swaps reversed bounds", () => {
    expect(resolveDateWindow({ exactDate: "", from: "2026-10-22", to: "2026-10-20" })).toEqual({
      gte: "2026-10-20T00:00:00.000Z",
      lt: "2026-10-23T00:00:00.000Z",
    });
  });

  it("gives exact-date filtering precedence over the range", () => {
    expect(
      resolveDateWindow({ exactDate: "2026-10-21", from: "2026-10-01", to: "2026-10-31" }),
    ).toEqual({
      gte: "2026-10-21T00:00:00.000Z",
      lt: "2026-10-22T00:00:00.000Z",
    });
  });

  it("supports a one-sided date range", () => {
    expect(resolveDateWindow({ exactDate: "", from: "2026-10-20", to: "" })).toEqual({
      gte: "2026-10-20T00:00:00.000Z",
      lt: "2026-10-21T00:00:00.000Z",
    });
  });

  it("serializes filters without dropping repeated values", () => {
    const params = filtersToSearchParams({
      turbine: "WT-03",
      severities: ["Critical", "High"],
      statuses: ["Active"],
      q: "vibration",
      exactDate: "",
      from: "2026-10-20",
      to: "2026-10-23",
      sort: "newest",
    });
    expect(params.getAll("severity")).toEqual(["Critical", "High"]);
    expect(params.get("turbine")).toBe("WT-03");
    expect(params.get("from")).toBe("2026-10-20");
  });

  it("parses and serializes priority sorting", () => {
    const filters = parseAlarmFilters({ sort: "priority" });
    expect(filters.sort).toBe("priority");
    expect(filtersToSearchParams(filters).get("sort")).toBe("priority");
    expect(hasActiveFilters(filters)).toBe(false);
  });

  it("sanitizes characters that would break a PostgREST or-filter", () => {
    expect(sanitizeSearchTerm("VIB,(201)%_")).toBe("VIB 201");
  });
});
