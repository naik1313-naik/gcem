"use client";

import { useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  File,
  Clock,
} from "lucide-react";
import { useActionState } from "react";

import { importAlarmsAction } from "@/app/(dashboard)/import/actions";
import type { ImportActionState, AlarmInsert } from "@/lib/types";
import {
  TARGET_SCHEMA,
  ColumnMapping,
  DatasetProfile,
  suggestMappings,
  profileDataset,
  applyMapping,
  validateMappedData,
  TargetField,
} from "@/lib/column-mapping";
import {
  parseCsvText,
  parseExcelBuffer,
  buildCsvFromRecords,
  extractDateRange,
  type ParsedFile,
} from "@/lib/csv-client";
import { gateForDownstreamBots } from "@/lib/validation-gate";

const initial: ImportActionState = { ok: false, message: "" };

/* ─────────────────────────────────────────────────────────────
   ImportWizard
   ───────────────────────────────────────────────────────────── */

export function ImportWizard() {
  const [step, setStep] = useState<"upload" | "mapping" | "import">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [validatedData, setValidatedData] = useState<AlarmInsert[] | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ row: number; message: string }[] | null>(null);
  const [importState, formAction] = useActionState(importAlarmsAction, initial);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setParsed(null);
    setProfile(null);
    setMapping({});
    setValidatedData(null);
    setValidationErrors(null);
    setStep("upload");

    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    let result: ParsedFile;
    if (ext === "csv") {
      const reader = new FileReader();
      const text = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(selectedFile);
      });
      result = parseCsvText(text);
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsArrayBuffer(selectedFile);
      });
      result = parseExcelBuffer(arrayBuffer);
    } else {
      result = {
        headers: [],
        records: [],
        totalRows: 0,
        parseError: "Unsupported file type. Use CSV or Excel (.xlsx, .xls).",
      };
    }

    if (result.parseError) {
      setParsed(result);
      setStep("upload");
      return;
    }

    setParsed(result);

    // Compute date range from timestamp-like columns
    const dateRange = extractDateRange(result.records, result.headers);

    // Profile the dataset for mapping suggestions
    const prof = profileDataset(result.records, result.headers);
    setProfile({ ...prof, dateRange });

    // Initialize mapping with high-confidence suggestions
    const initialMapping: ColumnMapping = {};
    prof.suggestedMappings.forEach((s) => {
      if (s.confidence >= 0.8) {
        initialMapping[s.targetField] = s.sourceColumn;
      }
    });
    setMapping(initialMapping);
    setStep("mapping");
  };

  const handleMappingChange = (field: TargetField, sourceColumn: string | null) => {
    setMapping((prev) => ({ ...prev, [field]: sourceColumn }));
  };

  const handleValidateMapping = () => {
    if (!parsed) return;

    // Apply column mapping first
    const mappedRecords = applyMapping(parsed.records, mapping);

    // Validation GATE: skip invalid data, only valid data proceeds
    const { validRecords, result } = gateForDownstreamBots(mappedRecords);
    setValidatedData(validRecords);
    setValidationErrors(
      result.errors.map((e) => ({ row: e.rowIndex, message: e.message })),
    );
  };

  const handleImport = async () => {
    if (!validatedData || validatedData.length === 0) return;

    // Convert validated mapped records back to CSV for the server import action
    const csvText = buildCsvFromRecords(validatedData as unknown as Record<string, unknown>[]);
    if (!csvText) return;

    const formData = new FormData();
    const blob = new Blob([csvText], { type: "text/csv" });
    formData.append("file", blob, "mapped-import.csv");

    await formAction(formData);
    if (importState.ok) {
      setStep("import");
    }
  };

  const requiredMapped = (Object.keys(TARGET_SCHEMA) as TargetField[]).filter(
    (f) => TARGET_SCHEMA[f].required,
  );

  const missingMappings = requiredMapped.filter((f) => !mapping[f]);

  if (step === "upload") {
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Step 1: Upload Dataset</h3>
          <span className="hint">CSV or Excel (.xlsx, .xls)</span>
        </div>
        <div className="panel-body">
          <div className="field wide">
            <label htmlFor="dataset-file">Select alarm data file</label>
            <div className="file-drop">
              <input
                id="dataset-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                required
              />
              <p className="small muted">
                CSV or Excel · maximum 4 MB · maximum 1,000 data rows
              </p>
            </div>
          </div>
          {parsed?.parseError && (
            <p className="form-message error" style={{ marginTop: 12 }}>
              <AlertCircle className="h-4 w-4" style={{ display: "inline-block", verticalAlign: "-2px", marginRight: 6 }} />
              {parsed.parseError}
            </p>
          )}
          {parsed && !parsed.parseError && (
            <div style={{ marginTop: 12 }}>
              <p className="small muted">
                {parsed.totalRows} data row(s) detected · {parsed.headers.length} column(s)
                {parsed.dateRange?.min && parsed.dateRange?.max && (
                  <>
                    · Date range:{" "}
                    <span className="strong">
                      {new Date(parsed.dateRange.min).toLocaleDateString()} –{" "}
                      {new Date(parsed.dateRange.max).toLocaleDateString()}
                    </span>
                  </>
                )}
              </p>
              <button onClick={() => setStep("mapping")} className="btn btn-primary">
                Continue to Column Mapping
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === "mapping") {
    if (!profile) return null;

    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Step 2: Map Columns</h3>
          <span className="hint">Match your columns to the required schema</span>
        </div>
        <div className="panel-body">
          <div className="note-box" style={{ marginBottom: 16 }}>
            <strong>Dataset Preview:</strong> {profile.rowCount} rows · {profile.headers.length} columns
            {profile.dateRange && (
              <> · Date range: {new Date(profile.dateRange.min!).toLocaleDateString()} – {new Date(profile.dateRange.max!).toLocaleDateString()}</>
            )}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="data" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th>Target Field</th>
                  <th>Required</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Source Column</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(TARGET_SCHEMA).map(([field, config]) => {
                  const suggestion = profile.suggestedMappings.find((s) => s.targetField === field);
                  const isMapped = mapping[field];
                  const isRequired = config.required;
                  return (
                    <tr key={field} style={{ background: isMapped ? "#f0fdf4" : isRequired && !isMapped ? "#fef2f2" : "" }}>
                      <td className="strong">{field}</td>
                      <td>{isRequired ? <span className="chip chip-critical">Required</span> : <span className="chip chip-minor">Optional</span>}</td>
                      <td><span className="small muted">{config.type}</span></td>
                      <td><span className="small muted">{config.description}</span></td>
                      <td>
                        <select
                          value={isMapped || ""}
                          onChange={(e) => handleMappingChange(field as TargetField, e.target.value || null)}
                          style={{ width: "100%", padding: "4px 8px", fontSize: "12px" }}
                        >
                          <option value="">— Not mapped —</option>
                          {profile.headers.map((h) => (
                            <option key={h} value={h}>
                              {h} {suggestion?.sourceColumn === h && suggestion.confidence >= 0.8 ? " ✓" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {suggestion ? (
                          <span className={`chip ${suggestion.confidence >= 0.8 ? "chip-minor" : suggestion.confidence >= 0.5 ? "chip-major" : "chip-critical"}`}>
                            {Math.round(suggestion.confidence * 100)}% — {suggestion.reason}
                          </span>
                        ) : (
                          <span className="chip chip-critical">No match</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {missingMappings.length > 0 && (
            <div className="note-box" style={{ marginTop: 16 }}>
              <strong>Missing required mappings:</strong>
              <ul className="evidence" style={{ marginTop: 6 }}>
                {missingMappings.map((f) => (
                  <li key={f}>
                    <span className="strong">{f}</span> — {TARGET_SCHEMA[f].description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="action-row" style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button onClick={() => setStep("upload")} className="btn btn-quiet">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={handleValidateMapping}
              disabled={missingMappings.length > 0}
              className="btn btn-primary"
            >
              Validate & Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "import") {
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>Import Result</h3>
          <span className="hint">{importState.ok ? "Success" : "Failed"}</span>
        </div>
        <div className="panel-body">
          <p className={`form-message ${importState.ok ? "ok" : "error"}`}>{importState.message}</p>
          {importState.summary && (
            <div className="incident-strip summary-grid" style={{ marginTop: 12 }}>
              {[
                ["Rows", importState.summary.totalRows],
                ["Valid", importState.summary.validRows],
                ["Imported", importState.summary.importedRows],
                ["Duplicates", importState.summary.duplicateRows],
                ["Invalid", importState.summary.invalidRows],
              ].map(([label, value]) => (
                <div key={label} className="strip-cell">
                  <div className="strip-label">{label}</div>
                  <div className="strip-value">{value}</div>
                </div>
              ))}
            </div>
          )}
          {importState.summary?.errors && importState.summary.errors.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: "13px", marginBottom: 8 }}>Invalid Rows</h4>
              <ul style={{ fontSize: "12px", margin: 0, paddingLeft: 18 }}>
                {importState.summary.errors.slice(0, 10).map((err) => (
                  <li key={`${err.row}-${err.message}`} style={{ marginBottom: 4 }}>
                    Row {err.row}: {err.message}
                  </li>
                ))}
                {importState.summary.errors.length > 10 && (
                  <li style={{ marginBottom: 4, fontStyle: "italic" }}>
                    ...and {importState.summary.errors.length - 10} more
                  </li>
                )}
              </ul>
            </div>
          )}
          {importState.summary?.duplicates && importState.summary.duplicates.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: "13px", marginBottom: 8 }}>Duplicate Rows Skipped</h4>
              <ul style={{ fontSize: "12px", margin: 0, paddingLeft: 18 }}>
                {importState.summary.duplicates.slice(0, 10).map((dup) => (
                  <li key={`${dup.row}-${dup.alarmId}`} style={{ marginBottom: 4 }}>
                    {dup.alarmId}: {dup.reason}
                  </li>
                ))}
                {importState.summary.duplicates.length > 10 && (
                  <li style={{ marginBottom: 4, fontStyle: "italic" }}>
                    ...and {importState.summary.duplicates.length - 10} more
                  </li>
                )}
              </ul>
            </div>
          )}
          <div className="action-row" style={{ marginTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                setStep("upload");
                setFile(null);
                setParsed(null);
                setProfile(null);
                setMapping({});
                setValidatedData(null);
                setValidationErrors(null);
              }}
            >
              <File className="h-4 w-4" style={{ marginRight: 6 }} /> Import Another File
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
