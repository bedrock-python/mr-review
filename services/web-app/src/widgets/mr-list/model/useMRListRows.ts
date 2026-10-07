import { useCallback, useMemo } from "react";
import { useInfiniteInboxMRs, useInfiniteMRs } from "@entities/mr";
import { flattenPages } from "@shared/api";
import { applyMRListView } from "../lib/mrListView";
import type { InboxMR, InboxScope, MR, MRStateFilter } from "@entities/mr";
import type { MRSortKey, ReadinessFilter } from "../lib/mrListView";

export type MRListRow =
  { kind: "repo"; key: string; mr: MR } | { kind: "inbox"; key: string; mr: InboxMR };

export type UseMRListRowsParams = {
  hostId: string | null;
  repoPath: string | null;
  isInbox: boolean;
  state: MRStateFilter;
  scope: InboxScope;
  /** Committed search: server-side `q` for a repository, a title filter in the inbox. */
  query: string;
  readiness: ReadinessFilter;
  sort: MRSortKey;
};

/** Query state of whichever list (repository or inbox) is active. */
export type MRListQueryState = {
  hasData: boolean;
  pageCount: number;
  error: Error | null;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  isPlaceholderData: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
};

export type MRListRowsResult = {
  rows: MRListRow[];
  /** Items loaded from the server, before client-side filtering. */
  loadedCount: number;
  list: MRListQueryState;
};

const getRepoMRKey = (mr: MR): string => String(mr.iid);
const getInboxMRKey = (mr: InboxMR): string => `${mr.repo_path}!${String(mr.iid)}`;
const getRowMR = (row: MRListRow): MR => row.mr;

/** Loads the repository or inbox MR list page by page and applies the client-side view. */
export const useMRListRows = ({
  hostId,
  repoPath,
  isInbox,
  state,
  scope,
  query,
  readiness,
  sort,
}: UseMRListRowsParams): MRListRowsResult => {
  // Both hooks always run (rules of hooks); the inactive one is disabled via null ids.
  const mrsQuery = useInfiniteMRs(isInbox ? null : hostId, isInbox ? null : repoPath, {
    state,
    query: isInbox ? "" : query,
  });
  const inboxQuery = useInfiniteInboxMRs(isInbox ? hostId : null, scope);
  const activeQuery = isInbox ? inboxQuery : mrsQuery;
  const { fetchNextPage, refetch } = activeQuery;

  const loadedRows = useMemo((): MRListRow[] => {
    if (isInbox) {
      return flattenPages(inboxQuery.data, getInboxMRKey).map((mr) => ({
        kind: "inbox",
        key: getInboxMRKey(mr),
        mr,
      }));
    }
    return flattenPages(mrsQuery.data, getRepoMRKey).map((mr) => ({
      kind: "repo",
      key: getRepoMRKey(mr),
      mr,
    }));
  }, [isInbox, inboxQuery.data, mrsQuery.data]);

  const rows = useMemo(
    () =>
      applyMRListView(loadedRows, getRowMR, {
        readiness,
        sort,
        titleFilter: isInbox ? query : undefined,
      }),
    [loadedRows, readiness, sort, isInbox, query]
  );

  const loadNextPage = useCallback((): void => {
    void fetchNextPage();
  }, [fetchNextPage]);

  const retry = useCallback((): void => {
    void refetch();
  }, [refetch]);

  return {
    rows,
    loadedCount: loadedRows.length,
    list: {
      hasData: activeQuery.data !== undefined,
      pageCount: activeQuery.data?.pages.length ?? 0,
      error: activeQuery.error,
      isPending: activeQuery.isPending,
      isFetching: activeQuery.isFetching,
      isError: activeQuery.isError,
      isPlaceholderData: activeQuery.isPlaceholderData,
      hasNextPage: activeQuery.hasNextPage,
      isFetchingNextPage: activeQuery.isFetchingNextPage,
      isFetchNextPageError: activeQuery.isFetchNextPageError,
      fetchNextPage: loadNextPage,
      refetch: retry,
    },
  };
};
