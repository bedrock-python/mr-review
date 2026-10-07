import { z } from "zod";
import type { InfiniteData } from "@tanstack/react-query";

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
