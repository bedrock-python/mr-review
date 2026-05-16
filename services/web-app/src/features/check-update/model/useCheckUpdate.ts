import { useQuery } from "@tanstack/react-query";

import { checkUpdateApi } from "../api";

// Poll every 2 hours; use a long staleTime so background refetches are cheap
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export const updateKeys = {
  all: ["update-check", "v2"] as const,
};

export const useCheckUpdate = () => {
  return useQuery({
    queryKey: updateKeys.all,
    queryFn: checkUpdateApi.checkForUpdate,
    staleTime: TWO_HOURS_MS,
    gcTime: TWO_HOURS_MS,
    // Do not retry on failure — GitHub API might be unreachable in air-gapped setups
    retry: false,
    // Refetch in the background on a 2-hour interval
    refetchInterval: TWO_HOURS_MS,
    refetchIntervalInBackground: false,
    // Never throw errors into the ErrorBoundary — update checks are best-effort
    throwOnError: false,
  });
};
