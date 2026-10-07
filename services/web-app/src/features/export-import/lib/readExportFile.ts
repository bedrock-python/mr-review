import { ExportFileSchema } from "@shared/api/export-import.api";
import type { ExportFile } from "@shared/api/export-import.api";

export type ReadExportFileResult = { ok: true; file: ExportFile } | { ok: false; error: string };

/**
 * Parse the text of a chosen file as an mr-review export.
 *
 * Only the envelope is checked here; the backend validates every record when the file is
 * previewed, and reports problems without echoing secrets back.
 */
export const parseExportFile = (text: string): ReadExportFileResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not valid JSON." };
  }
  const parsed = ExportFileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "This file is not an mr-review export." };
  }
  return { ok: true, file: parsed.data };
};

export const readExportFile = async (file: File): Promise<ReadExportFileResult> => {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "The file could not be read." };
  }
  return parseExportFile(text);
};
