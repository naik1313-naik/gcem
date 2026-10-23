"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { parseAlarmCsv } from "@/lib/csv";
import { importAlarms } from "@/lib/db/alarms";
import type { CsvDuplicate, ImportActionState, ImportSummary } from "@/lib/types";

function summaryMessage(summary: ImportSummary): string {
  if (summary.fatalError) return summary.fatalError;
  const parts = [
    `${summary.importedRows} imported`,
    `${summary.duplicateRows} duplicate(s) skipped`,
    `${summary.invalidRows} invalid row(s)`,
  ];
  return `${parts.join(" · ")}.`;
}

export async function importAlarmsAction(
  _previous: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file to import." };
  }
  if (file.size > 4 * 1024 * 1024) {
    return { ok: false, message: "CSV files must be 4 MB or smaller." };
  }

  const text = await file.text();
  const parsed = parseAlarmCsv(text);

  if (parsed.fatalError) {
    return {
      ok: false,
      message: parsed.fatalError,
      summary: {
        totalRows: parsed.totalRows,
        validRows: 0,
        importedRows: 0,
        duplicateRows: 0,
        invalidRows: 0,
        errors: parsed.errors,
        duplicates: parsed.duplicates,
        fatalError: parsed.fatalError,
      },
    };
  }

  try {
    const result = await importAlarms(parsed.rows);
    const dbDuplicates: CsvDuplicate[] = result.duplicates.map((duplicate) => ({
      row: 0,
      alarmId: duplicate.alarmId,
      reason: duplicate.reason,
    }));
    const duplicates = [...parsed.duplicates, ...dbDuplicates];
    const summary: ImportSummary = {
      totalRows: parsed.totalRows,
      validRows: parsed.rows.length,
      importedRows: result.imported,
      duplicateRows: duplicates.length,
      invalidRows: parsed.errors.length,
      errors: parsed.errors,
      duplicates,
    };

    revalidatePath("/alarms");
    revalidatePath("/insights");
    revalidatePath("/maintenance");
    revalidatePath("/analytics");
    revalidatePath("/");

    return {
      ok: summary.importedRows > 0 || summary.duplicateRows > 0,
      message: summaryMessage(summary),
      summary,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not import the CSV.",
      summary: {
        totalRows: parsed.totalRows,
        validRows: parsed.rows.length,
        importedRows: 0,
        duplicateRows: parsed.duplicates.length,
        invalidRows: parsed.errors.length,
        errors: parsed.errors,
        duplicates: parsed.duplicates,
      },
    };
  }
}
