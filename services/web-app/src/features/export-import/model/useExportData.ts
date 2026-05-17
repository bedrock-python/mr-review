/**
 * Hook for exporting data
 */

import { useMutation } from "@tanstack/react-query";
import { exportImportApi } from "@shared/api/export-import.api";
import type { ExportRequest, ExportResponse } from "@shared/api/export-import.api";

export const useExportData = () => {
  return useMutation({
    mutationFn: (request: ExportRequest) => exportImportApi.exportData(request),
    onSuccess: (data: ExportResponse) => {
      // Download the exported data as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mr-review-export-${data.exported_at}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
};
