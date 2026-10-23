/* ─────────────────────────────────────────────────────────────
   Client-side CSV / Excel parsing for the import wizard.
   Robust quoted-CSV handling (embedded commas, doubled quotes,
   newlines inside quotes, BOM). Excel via the xlsx library.
   ───────────────────────────────────────────────────────────── */

import * as XLSX from "xlsx";

export interface ParsedFile {
  headers: string[];
  records: Record<string, unknown>[];
  totalRows: number;
  parseError?: string;
  dateRange?: { min: string | null; max: string | null };
}

/** Parse CSV text into headers and records. Handles quoted fields. */
export function parseCsvText(text: string): ParsedFile {
  const trimmed = text.replace(/^\uFEFF/, ""); // strip BOM
  if (!trimmed.trim()) {
    return { headers: [], records: [], totalRows: 0, parseError: "Empty file" };
  }

  const records: Record<string, unknown>[] = [];
  let headers: string[] = [];
  let i = 0;
  const len = trimmed.length;

  function readField(): string {
    let field = "";
    if (i < len && trimmed[i] === '"') {
      i++; // skip opening quote
      while (i < len) {
        if (trimmed[i] === '"') {
          if (i + 1 < len && trimmed[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += trimmed[i];
          i++;
        }
      }
    } else {
      while (
        i < len &&
        trimmed[i] !== "," &&
        trimmed[i] !== "\n" &&
        trimmed[i] !== "\r"
      ) {
        field += trimmed[i];
        i++;
      }
    }
    return field;
  }

  function skipLineEnd(): void {
    if (i < len && trimmed[i] === "\r") {
      i++;
      if (i < len && trimmed[i] === "\n") i++;
    } else if (i < len && trimmed[i] === "\n") {
      i++;
    }
  }

  // Read header row
  while (i < len) {
    const field = readField();
    headers.push(field.trim());
    if (i < len && trimmed[i] === ",") {
      i++;
      continue;
    }
    skipLineEnd();
    break;
  }

  if (headers.length === 0) {
    return { headers: [], records: [], totalRows: 0, parseError: "Empty file" };
  }

  // Read data rows
  while (i < len) {
    const record: Record<string, unknown> = {};
    let colIndex = 0;
    while (i < len) {
      const field = readField();
      const header = headers[colIndex] ?? `column_${colIndex}`;
      record[header] = field;
      colIndex++;
      if (i < len && trimmed[i] === ",") {
        i++;
        continue;
      }
      skipLineEnd();
      break;
    }
    const allEmpty = Object.values(record).every(
      (v) => v === "" || v === null || v === undefined,
    );
    if (!allEmpty) {
      records.push(record);
    }
  }

  return { headers, records, totalRows: records.length };
}

/** Parse an Excel file (ArrayBuffer) into headers and records. */
export function parseExcelBuffer(arrayBuffer: ArrayBuffer): ParsedFile {
  try {
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return {
        headers: [],
        records: [],
        totalRows: 0,
        parseError: "No sheets found in Excel file",
      };
    }
    const worksheet = workbook.Sheets[firstSheetName];
    const json = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      blankrows: false,
    }) as unknown[][];

    if (!json || json.length === 0) {
      return {
        headers: [],
        records: [],
        totalRows: 0,
        parseError: "Excel sheet is empty",
      };
    }

    const headers = (json[0] as unknown[]).map((h) => String(h ?? "").trim());
    const records: Record<string, unknown>[] = [];
    for (let r = 1; r < json.length; r++) {
      const row = json[r];
      const record: Record<string, unknown> = {};
      let allEmpty = true;
      headers.forEach((h, idx) => {
        const val = row[idx];
        if (val !== undefined && val !== null && val !== "") {
          allEmpty = false;
        }
        record[h] = val ?? "";
      });
      if (!allEmpty) {
        records.push(record);
      }
    }

    return { headers, records, totalRows: records.length };
  } catch (err) {
    return {
      headers: [],
      records: [],
      totalRows: 0,
      parseError: `Failed to parse Excel file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Convert mapped records back to CSV text for server import. */
export function buildCsvFromRecords(records: Record<string, unknown>[]): string {
  if (records.length === 0) return "";
  const headers = Object.keys(records[0] as Record<string, unknown>);
  const escape = (value: unknown): string => {
    const s = String(value ?? "");
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(",")];
  for (const record of records) {
    lines.push(headers.map((h) => escape(record[h])).join(","));
  }
  return lines.join("\n");
}

/** Extract min/max date from timestamp-like columns. */
export function extractDateRange(
  records: Record<string, unknown>[],
  headers: string[],
): { min: string | null; max: string | null } {
  const dateCols = headers.filter((h) => /time|date|timestamp/i.test(h));
  if (dateCols.length === 0) return { min: null, max: null };

  let min: Date | null = null;
  let max: Date | null = null;

  for (const record of records) {
    for (const col of dateCols) {
      const parsed = new Date(String(record[col] ?? ""));
      if (!Number.isNaN(parsed.getTime())) {
        if (!min || parsed < min) min = parsed;
        if (!max || parsed > max) max = parsed;
      }
    }
  }

  return { min: min ? min.toISOString() : null, max: max ? max.toISOString() : null };
}
