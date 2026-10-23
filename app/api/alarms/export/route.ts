import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { buildAlarmCsv } from "@/lib/csv";
import { EMPTY_FILTERS, listAlarms } from "@/lib/db/alarms";
import { isDemoMode } from "@/lib/demo-mode";
import { parseAlarmFilters, type SearchParams } from "@/lib/filters";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

function paramsFromUrl(url: URL): SearchParams {
  const output: SearchParams = {};
  const keys = new Set(url.searchParams.keys());
  keys.forEach((key) => {
    const values = url.searchParams.getAll(key);
    output[key] = values.length > 1 ? values : values[0];
  });
  return output;
}

export async function GET(request: NextRequest) {
  if (!isDemoMode() && !isSupabaseConfigured) {
    return new Response("Supabase is not configured.", { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  try {
    const filters = parseAlarmFilters(paramsFromUrl(request.nextUrl)) ?? EMPTY_FILTERS;
    const alarms = await listAlarms(filters, 5000);
    const csv = buildAlarmCsv(alarms);
    const filename = `windsage-alarms-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? `Export failed: ${error.message}` : "Export failed.",
      { status: 500 },
    );
  }
}
