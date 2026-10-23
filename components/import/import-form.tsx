"use client";

import { Upload } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { importAlarmsAction } from "@/app/(dashboard)/import/actions";
import type { ImportActionState } from "@/lib/types";

const initial: ImportActionState = { ok: false, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      <Upload className="h-4 w-4" />
      {pending ? "Validating and importing…" : "Import alarms"}
    </button>
  );
}

function Summary({ state }: { state: ImportActionState }) {
  const summary = state.summary;
  if (!summary) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <p className={`form-message ${state.ok ? "ok" : "error"}`} role="status">
        {state.message}
      </p>

      <div className="incident-strip summary-grid" style={{ marginTop: 12 }}>
        {[
          ["Rows", summary.totalRows],
          ["Valid", summary.validRows],
          ["Imported", summary.importedRows],
          ["Duplicates", summary.duplicateRows],
          ["Invalid", summary.invalidRows],
        ].map(([label, value]) => (
          <div className="strip-cell" key={String(label)}>
            <div className="strip-label">{label}</div>
            <div className="strip-value">{value}</div>
          </div>
        ))}
      </div>

      {summary.errors.length ? (
        <div className="note-box" style={{ marginTop: 12 }}>
          <strong>Validation errors</strong>
          <ul className="evidence" style={{ marginTop: 6 }}>
            {summary.errors.slice(0, 12).map((error, index) => (
              <li key={`${error.row}-${index}`}>
                Row {error.row}: {error.message}
              </li>
            ))}
          </ul>
          {summary.errors.length > 12 ? (
            <p className="small muted" style={{ marginTop: 4 }}>
              + {summary.errors.length - 12} more error(s)
            </p>
          ) : null}
        </div>
      ) : null}

      {summary.duplicates.length ? (
        <div className="note-box" style={{ marginTop: 12 }}>
          <strong>Duplicates skipped</strong>
          <ul className="evidence" style={{ marginTop: 6 }}>
            {summary.duplicates.slice(0, 12).map((duplicate, index) => (
              <li key={`${duplicate.alarmId}-${index}`}>
                {duplicate.row ? `Row ${duplicate.row}: ` : ""}
                <span className="strong">{duplicate.alarmId}</span> — {duplicate.reason}
              </li>
            ))}
          </ul>
          {summary.duplicates.length > 12 ? (
            <p className="small muted" style={{ marginTop: 4 }}>
              + {summary.duplicates.length - 12} more duplicate(s)
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ImportForm() {
  const [state, formAction] = useActionState(importAlarmsAction, initial);

  return (
    <div>
      <form action={formAction}>
        <div className="field wide">
          <label htmlFor="csv-file">Alarm CSV file</label>
          <div className="file-drop">
            <input
              id="csv-file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
            />
            <p className="small muted">
              CSV only · maximum 4 MB · maximum 1,000 data rows
            </p>
          </div>
        </div>
        <div className="action-row" style={{ marginTop: 12 }}>
          <SubmitButton />
        </div>
      </form>
      <Summary state={state} />
    </div>
  );
}
