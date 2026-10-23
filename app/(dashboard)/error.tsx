"use client";

import { RotateCcw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="panel" style={{ maxWidth: 720, margin: "40px auto" }}>
      <div className="panel-head">
        <h3>Could not load this view</h3>
        <span className="hint">console error</span>
      </div>
      <div className="panel-body">
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
          {error.message || "An unexpected database or network error occurred."}
        </p>
        <div className="note-box">
          Confirm that the Supabase migrations have been applied and that your session is still
          valid.
        </div>
        <div className="action-row" style={{ marginTop: 12 }}>
          <button type="button" onClick={reset} className="btn btn-primary">
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
