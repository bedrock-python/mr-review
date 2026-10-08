/**
 * Hooks for previewing and importing an export file
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { aiProviderKeys } from "@entities/ai-provider";
import { hostKeys } from "@entities/host";
import { mrKeys } from "@entities/mr";
import { reviewKeys } from "@entities/review";
import { exportImportApi } from "@shared/api/export-import.api";
import type { ExportFile, ImportRequest } from "@shared/api/export-import.api";

/** Validates a file and counts its records against the store. Writes nothing. */
export const useImportPreview = () => {
  return useMutation({
    mutationFn: (file: ExportFile) => exportImportApi.previewImport(file),
  });
};

export const useImportData = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ImportRequest) => exportImportApi.importData(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hostKeys.all });
      void queryClient.invalidateQueries({ queryKey: aiProviderKeys.all });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.all });
      // Imported favourites change the repository lists.
      void queryClient.invalidateQueries({ queryKey: mrKeys.all });
    },
  });
};
