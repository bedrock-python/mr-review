import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { FIRST_PAGE, getNextPageParam } from "@shared/api";
import { mrApi, REPOS_PAGE_SIZE, MRS_PAGE_SIZE, INBOX_PAGE_SIZE } from "../api/mrApi";
import type { InfiniteData, QueryKey, UseInfiniteQueryResult } from "@tanstack/react-query";
import type { InboxMRPage, InboxScope, MRPage, MRStateFilter, Repo, RepoPage } from "./mr.schema";

const LIST_STALE_TIME_MS = 2 * 60 * 1000;

/** Shorter repo searches are not sent to the server. */
export const MIN_REPO_QUERY_LENGTH = 2;

export type RepoListFilters = { q: string; perPage: number };
export type MRListFilters = { state: MRStateFilter; q: string; perPage: number };
export type InboxListFilters = { scope: InboxScope; perPage: number };

export const mrKeys = {
  all: ["mrs"] as const,
  repos: (hostId: string) => [...mrKeys.all, "repos", hostId] as const,
  repoList: (hostId: string, filters: RepoListFilters) =>
    [...mrKeys.repos(hostId), "infinite", filters] as const,
  inbox: (hostId: string) => [...mrKeys.all, "inbox", hostId] as const,
  inboxList: (hostId: string, filters: InboxListFilters) =>
    [...mrKeys.inbox(hostId), "infinite", filters] as const,
  lists: (hostId: string, repoPath: string) => [...mrKeys.all, "list", hostId, repoPath] as const,
  list: (hostId: string, repoPath: string, filters: MRListFilters) =>
    [...mrKeys.lists(hostId, repoPath), "infinite", filters] as const,
  details: (hostId: string, repoPath: string) =>
    [...mrKeys.all, "detail", hostId, repoPath] as const,
  detail: (hostId: string, repoPath: string, mrIid: number) =>
    [...mrKeys.details(hostId, repoPath), mrIid] as const,
  diff: (hostId: string, repoPath: string, mrIid: number) =>
    [...mrKeys.all, "diff", hostId, repoPath, mrIid] as const,
};

export type InfiniteListResult<TPage> = UseInfiniteQueryResult<InfiniteData<TPage, number>>;

/**
 * Keeps the previous list on screen while a filter or search change loads, but
 * only within the same scope (host / repository): showing another repository's
 * MRs as a placeholder would be wrong data, not a smooth transition.
 */
const keepPreviousWithin =
  <TData>(scope: QueryKey) =>
  (
    previousData: TData | undefined,
    previousQuery: { queryKey: QueryKey } | undefined
  ): TData | undefined => {
    if (!previousQuery) return undefined;
    const isSameScope = scope.every((part, index) => previousQuery.queryKey[index] === part);
    return isSameScope ? keepPreviousData(previousData) : undefined;
  };

export const useInfiniteRepos = (
  hostId: string | null,
  query?: string
): InfiniteListResult<RepoPage> => {
  const filters: RepoListFilters = { q: query?.trim() ?? "", perPage: REPOS_PAGE_SIZE };
  const isQueryAllowed = filters.q === "" || filters.q.length >= MIN_REPO_QUERY_LENGTH;
  return useInfiniteQuery({
    queryKey: mrKeys.repoList(hostId ?? "", filters),
    queryFn: ({ pageParam, signal }) => {
      if (hostId === null) return Promise.reject(new Error("hostId is null"));
      return mrApi.listRepos(
        hostId,
        { q: filters.q, page: pageParam, perPage: filters.perPage },
        signal
      );
    },
    initialPageParam: FIRST_PAGE,
    getNextPageParam,
    enabled: hostId !== null && isQueryAllowed,
    placeholderData: keepPreviousWithin<InfiniteData<RepoPage, number>>(mrKeys.repos(hostId ?? "")),
    staleTime: LIST_STALE_TIME_MS,
  });
};

export type UseInfiniteMRsParams = {
  state: MRStateFilter;
  query?: string;
};

export const useInfiniteMRs = (
  hostId: string | null,
  repoPath: string | null,
  { state, query }: UseInfiniteMRsParams
): InfiniteListResult<MRPage> => {
  const filters: MRListFilters = { state, q: query?.trim() ?? "", perPage: MRS_PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: mrKeys.list(hostId ?? "", repoPath ?? "", filters),
    queryFn: ({ pageParam, signal }) => {
      if (hostId === null || repoPath === null) return Promise.reject(new Error("null params"));
      return mrApi.listMRs(
        hostId,
        repoPath,
        { state: filters.state, q: filters.q, page: pageParam, perPage: filters.perPage },
        signal
      );
    },
    initialPageParam: FIRST_PAGE,
    getNextPageParam,
    enabled: hostId !== null && repoPath !== null,
    placeholderData: keepPreviousWithin<InfiniteData<MRPage, number>>(
      mrKeys.lists(hostId ?? "", repoPath ?? "")
    ),
    staleTime: LIST_STALE_TIME_MS,
  });
};

export const useInfiniteInboxMRs = (
  hostId: string | null,
  scope: InboxScope
): InfiniteListResult<InboxMRPage> => {
  const filters: InboxListFilters = { scope, perPage: INBOX_PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: mrKeys.inboxList(hostId ?? "", filters),
    queryFn: ({ pageParam, signal }) => {
      if (hostId === null) return Promise.reject(new Error("hostId is null"));
      return mrApi.listInboxMRs(
        hostId,
        { scope: filters.scope, page: pageParam, perPage: filters.perPage },
        signal
      );
    },
    initialPageParam: FIRST_PAGE,
    getNextPageParam,
    enabled: hostId !== null,
    placeholderData: keepPreviousWithin<InfiniteData<InboxMRPage, number>>(
      mrKeys.inbox(hostId ?? "")
    ),
    staleTime: LIST_STALE_TIME_MS,
  });
};

const hasRepoPages = (data: unknown): data is InfiniteData<RepoPage, number> =>
  typeof data === "object" && data !== null && "pages" in data && Array.isArray(data.pages);

/**
 * Looks a repository up in whatever repo pages are already cached for the host,
 * without fetching. Cache entries of another shape (e.g. persisted by an older
 * app version) are skipped.
 */
export const useCachedRepo = (hostId: string | null, repoPath: string | null): Repo | undefined => {
  const queryClient = useQueryClient();
  if (hostId === null || repoPath === null) return undefined;
  for (const [, data] of queryClient.getQueriesData({ queryKey: mrKeys.repos(hostId) })) {
    if (!hasRepoPages(data)) continue;
    for (const page of data.pages) {
      const repo = page.items.find((item) => item.path === repoPath);
      if (repo) return repo;
    }
  }
  return undefined;
};

export const useMR = (
  hostId: string | null,
  repoPath: string | null,
  mrIid: number | null
): ReturnType<typeof useQuery<Awaited<ReturnType<typeof mrApi.getMR>>>> => {
  return useQuery({
    queryKey: mrKeys.detail(hostId ?? "", repoPath ?? "", mrIid ?? 0),
    queryFn: () => {
      if (hostId === null || repoPath === null || mrIid === null)
        return Promise.reject(new Error("null params"));
      return mrApi.getMR(hostId, repoPath, mrIid);
    },
    enabled: hostId !== null && repoPath !== null && mrIid !== null,
    staleTime: 10 * 60 * 1000,
  });
};

export const useDiff = (
  hostId: string | null,
  repoPath: string | null,
  mrIid: number | null
): ReturnType<typeof useQuery<Awaited<ReturnType<typeof mrApi.getDiff>>>> => {
  return useQuery({
    queryKey: mrKeys.diff(hostId ?? "", repoPath ?? "", mrIid ?? 0),
    queryFn: () => {
      if (hostId === null || repoPath === null || mrIid === null)
        return Promise.reject(new Error("null params"));
      return mrApi.getDiff(hostId, repoPath, mrIid);
    },
    enabled: hostId !== null && repoPath !== null && mrIid !== null,
    staleTime: 10 * 60 * 1000,
  });
};
