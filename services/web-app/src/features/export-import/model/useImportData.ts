/**
 * Hook for importing data
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { exportImportApi } from "@shared/api/export-import.api";
import type { ImportRequest } from "@shared/api/export-import.api";

export const useImportData = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ImportRequest) => exportImportApi.importData(request),
    onSuccess: () => {
      // Invalidate all queries to refetch data
      void queryClient.invalidateQueries({ queryKey: ["hosts"] });
      void queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
};
