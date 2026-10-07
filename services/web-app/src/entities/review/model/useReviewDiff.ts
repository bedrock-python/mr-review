import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { reviewApi } from "../api/reviewApi";

const REVIEW_DIFF_STALE_MS = 5 * 60 * 1000;

// Every consumer of the raw review diff shares this key, so the text is fetched once per
// review no matter how many stages (brief size estimate, polish diff, code context) need it.
export const reviewDiffKey = (reviewId: string | null): readonly ["review-diff", string | null] =>
  ["review-diff", reviewId] as const;

export const useReviewDiff = (reviewId: string | null): UseQueryResult<string> =>
  useQuery({
    queryKey: reviewDiffKey(reviewId),
    queryFn: () => {
      if (reviewId === null) return Promise.reject(new Error("reviewId is null"));
      return reviewApi.getDiff(reviewId);
    },
    enabled: reviewId !== null,
    staleTime: REVIEW_DIFF_STALE_MS,
  });
