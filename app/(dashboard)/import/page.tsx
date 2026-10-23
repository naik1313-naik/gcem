import { Download, FileSpreadsheet, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { ImportWizard } from "@/components/import/import-wizard";
import { requireAdmin } from "@/lib/auth";
import { REQUIRED_COLUMNS, SENSOR_COLUMNS } from "@/lib/csv";
import { isDemoMode } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Import / Export · WindSage",
};

export default async function ImportPage() {
  await requireAdmin();
  const demoMode = isDemoMode();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Import / Export</h1>
          <p className="page-sub">
            {demoMode
              ? "Validate alarm CSVs, detect duplicates, and export the in-memory demo alarm register."
              : "Validate alarm CSVs, detect duplicates, and export the persistent PostgreSQL alarm register."}
          </p>
        </div>
        <div className="page-meta">Admin only · CSV · Excel</div>
      </div>

      <div className="note-box" style={{ margin: "0 0 14px" }}>
        <ShieldCheck className="h-4 w-4" style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
        {demoMode
          ? "Demo imports are written to server memory and reset when the dev server restarts."
          : "Imports are written directly to Supabase PostgreSQL with your authenticated session."}{" "}
        Rows with an existing <b>alarm_id</b>, or the same turbine/timestamp/alarm code, are skipped
        and reported. Invalid rows are never inserted.
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h3>Import alarm history</h3>
            <span className="hint">Supports CSV and Excel with automatic column detection</span>
          </div>
          <div className="panel-body">
            <ImportWizard />
          </div>
        </section>

        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <section className="panel">
            <div className="panel-head">
              <h3>Start from the template</h3>
              <span className="hint">header + one example</span>
            </div>
            <div className="panel-body">
              <p className="small muted" style={{ lineHeight: 1.6 }}>
                Download a header row plus one example alarm. Optional sensor columns are{" "}
                {SENSOR_COLUMNS.join(", ")}.
              </p>
              <a href="/api/alarms/template" className="btn" style={{ marginTop: 10 }}>
                <Download className="h-4 w-4" />
                Download CSV template
              </a>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Export alarm history</h3>
              <span className="hint">up to 5,000 records</span>
            </div>
            <div className="panel-body">
              <p className="small muted" style={{ lineHeight: 1.6 }}>
                Export the current alarm register. Filter the incident list first, then return here
                for a full export.
              </p>
              <a href="/api/alarms/export" className="btn" style={{ marginTop: 10 }}>
                <Download className="h-4 w-4" />
                Export all alarms
              </a>
              <Link
                href="/incidents"
                className="btn btn-quiet"
                style={{ marginLeft: 6, marginTop: 10 }}
              >
                Filter incidents first
              </Link>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Import rules</h3>
              <span className="hint">read before upload</span>
            </div>
            <div className="panel-body">
              <ul className="evidence" style={{ lineHeight: 1.65 }}>
                <li>Severity: Critical, High, Medium, or Low.</li>
                <li>Status: Active, Acknowledged, or Resolved.</li>
                <li>Timestamps without a timezone are interpreted as UTC.</li>
                <li>Unknown turbine IDs are created automatically.</li>
                <li>Duplicate and invalid rows are summarised, not silently dropped.</li>
                <li>Column mapping is required for non-standard headers.</li>
              </ul>
            </div>
          </section>
        </div>
      </div>

      <p className="footnote">
        <FileSpreadsheet className="h-3.5 w-3.5" style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
        Import validation is server-side. Formula-injection protection is applied on export.
      </p>
    </>
  );
}
