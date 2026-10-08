import { useState } from "react";
import { hashKey, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";

/** Page numbers are 1-based on the backend. */
export const FIRST_PAGE = 1;

/** Envelope metadata shared by every paginated list endpoint. */
export const PageMetaSchema = z.object({
  page: z.number().int().positive(),
  per_page: z.number().int().positive(),
  has_more: z.boolean(),
});

export type PageMeta = z.infer<typeof PageMetaSchema>;

export type Page<TItem> = PageMeta & { items: TItem[] };

/** `getNextPageParam` for `useInfiniteQuery` over the page envelope. */
export const getNextPageParam = (lastPage: PageMeta): number | undefined =>
  lastPage.has_more ? lastPage.page + 1 : undefined;

/**
 * Concatenates loaded pages into one list. Offset pagination over a live list can
 * shift items between requests (a new MR pushes everything down by one), so the
 * same item may arrive on two consecutive pages; the first occurrence wins.
 */
export const flattenPages = <TItem>(
  data: InfiniteData<Page<TItem>> | undefined,
  getKey: (item: TItem) => string
): TItem[] => {
  if (!data) return [];
  const seen = new Set<string>();
  const items: TItem[] = [];
  for (const page of data.pages) {
    for (const item of page.items) {
      const key = getKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return items;
};

/**
 * Keeps only the first page of a stale infinite query. Refetching an infinite query
 * replays every page it holds, one request after another; a list remounted after
 * its stale time (or restored from the persisted cache) would otherwise re-request
 * every page the user once scrolled through. The query stays stale, so the next
 * observer refetches just page 1, and later pages load again as the list scrolls.
 */
export const trimStaleInfiniteQuery = (
  queryClient: QueryClient,
  queryKey: QueryKey,
  staleTimeMs: number,
  now: number = Date.now()
): void => {
  const state = queryClient.getQueryState<InfiniteData<unknown>>(queryKey);
  const data = state?.data;
  if (!state || !data || data.pages.length <= 1) return;
  const isStale = state.isInvalidated || now - state.dataUpdatedAt >= staleTimeMs;
  if (!isStale) return;
  queryClient.setQueryData<InfiniteData<unknown>>(
    queryKey,
    { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
    // Keep the old timestamp: the trimmed query must still read as stale and refetch.
    { updatedAt: state.dataUpdatedAt }
  );
  if (state.isInvalidated) {
    void queryClient.invalidateQueries({ queryKey, exact: true, refetchType: "none" });
  }
};

/**
 * Applies `trimStaleInfiniteQuery` once each time a list starts showing a query key
 * (mount, or a switch to another filter's cached query), before it subscribes, so a
 * list that stays mounted never loses pages under the user.
 */
export const useRestartStaleInfiniteQuery = (queryKey: QueryKey, staleTimeMs: number): void => {
  const queryClient = useQueryClient();
  const keyHash = hashKey(queryKey);
  const [checkedKeyHash, setCheckedKeyHash] = useState<string | null>(null);
  if (checkedKeyHash !== keyHash) {
    setCheckedKeyHash(keyHash);
    trimStaleInfiniteQuery(queryClient, queryKey, staleTimeMs);
  }
};
