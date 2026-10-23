import { IncidentConsole } from "@/components/console/incident-console";
import { requireUser } from "@/lib/auth";
import { EMPTY_FILTERS, listAlarms } from "@/lib/db/alarms";
import { listIncidents } from "@/lib/db/incidents";
import { isValidDateInput, type SearchParams } from "@/lib/filters";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Incidents · WindSage",
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function IncidentsPage({
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

  const exactDate = first(params.exactDate);
  const from = first(params.from);
  const to = first(params.to);

  return (
    <IncidentConsole
      alarms={alarms}
      incidents={incidents}
      now={Date.now()}
      initialAlarmId={first(params.alarm) || undefined}
      initialFilters={{
        turbine: first(params.turbine),
        category: first(params.category),
        status: first(params.status),
        q: first(params.q),
        openOnly: first(params.open) === "1" || first(params.openOnly) === "true",
        exactDate: isValidDateInput(exactDate) ? exactDate : "",
        from: isValidDateInput(from) ? from : "",
        to: isValidDateInput(to) ? to : "",
      }}
    />
  );
}
