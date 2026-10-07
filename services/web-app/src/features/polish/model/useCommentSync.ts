import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCommentSync } from "./commentSync";
import type { CommentSync } from "./commentSync";

export type UseCommentSyncResult = {
  sync: CommentSync;
  isSaving: boolean;
};

export const useCommentSync = (reviewId: string): UseCommentSyncResult => {
  const queryClient = useQueryClient();
  const sync = useMemo(() => getCommentSync(queryClient, reviewId), [queryClient, reviewId]);
  const { isSaving } = useSyncExternalStore(sync.subscribe, sync.getState);

  // Leaving the stage sends coalesced edits right away instead of after the debounce.
  useEffect(
    () => () => {
      void sync.flush();
    },
    [sync]
  );

  return { sync, isSaving };
};
