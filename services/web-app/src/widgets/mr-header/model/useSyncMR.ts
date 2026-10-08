import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hostApi } from "@entities/host";
import { mrKeys } from "@entities/mr";
import type { QueryKey, UseMutationResult } from "@tanstack/react-query";

export type SyncMRTarget = {
  hostId: string;
  repoPath: string;
  mrIid: number;
  /** Open review whose diff, context and prompt are built from this MR. */
  reviewId: string | null;
};

// Review-scoped queries derived from the MR's upstream data; the keys belong to
// the review entity and the stage features (`["review-diff", reviewId]`, …).
const REVIEW_QUERY_PREFIXES = ["review-diff", "review-context", "review-prompt"] as const;

const getSyncedKeys = ({ hostId, repoPath, mrIid, reviewId }: SyncMRTarget): QueryKey[] => {
  const keys: QueryKey[] = [
    mrKeys.detail(hostId, repoPath, mrIid),
    mrKeys.diff(hostId, repoPath, mrIid),
    mrKeys.lists(hostId, repoPath),
    mrKeys.inbox(hostId),
  ];
  if (reviewId !== null) {
    keys.push(...REVIEW_QUERY_PREFIXES.map((prefix) => [prefix, reviewId]));
  }
  return keys;
};

/**
 * "Sync": drops the backend's cache for the repository first (otherwise a
 * refetch just returns the same cached upstream data), then refetches every
 * on-screen query built from this MR. Success is reported only once those
 * refetches succeeded.
 */
export const useSyncMR = (): UseMutationResult<void, Error, SyncMRTarget> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (target: SyncMRTarget): Promise<void> => {
      await hostApi.invalidateCache(target.hostId, target.repoPath);
      await Promise.all(
        getSyncedKeys(target).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }, { throwOnError: true })
        )
      );
    },
    onSuccess: () => {
      toast.success("MR synced");
    },
    onError: (error) => {
      toast.error("Sync failed", { description: error.message });
    },
  });
};
