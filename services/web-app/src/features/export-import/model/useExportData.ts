/**
 * Hook for exporting data
 */

import { useMutation } from "@tanstack/react-query";
import { exportImportApi } from "@shared/api/export-import.api";
import type { ExportFile, ExportRequest } from "@shared/api/export-import.api";

/** `2026-10-08T12:30:05.123Z` → `20261008T123005Z`: safe in file names on every OS. */
const fileStamp = (isoTimestamp: string): string => {
  const date = new Date(isoTimestamp);
  const iso = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  return iso.replace(/\.\d+Z$/, "Z").replace(/[-:]/g, "");
};

const downloadExportFile = (file: ExportFile): void => {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mr-review-export-${fileStamp(file.exported_at)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const useExportData = () => {
  return useMutation({
    mutationFn: (request: ExportRequest) => exportImportApi.exportData(request),
    onSuccess: downloadExportFile,
  });
};
