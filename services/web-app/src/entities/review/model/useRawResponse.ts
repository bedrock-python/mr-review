import { queryOptions, useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { reviewApi } from "../api/reviewApi";
import { reviewKeys } from "./useReviews";

/**
 * Query for the raw model output an iteration was parsed from (null when none was
 * stored). The key nests under the review's detail key, so invalidating the review
 * after a dispatch or an import refreshes it too.
 */
export const rawResponseQueryOptions = (reviewId: string, iterationId: string) =>
  queryOptions({
    queryKey: [...reviewKeys.detail(reviewId), "raw-response", iterationId] as const,
    queryFn: () => reviewApi.getRawResponse(reviewId, iterationId),
    // Model output can be large and the query cache is persisted to localStorage,
    // so it is dropped as soon as nothing displays it.
    gcTime: 0,
  });

export const useRawResponse = (
  reviewId: string,
  iterationId: string
): UseQueryResult<string | null> => useQuery(rawResponseQueryOptions(reviewId, iterationId));
