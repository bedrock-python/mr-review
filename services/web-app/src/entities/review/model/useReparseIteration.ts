import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { reviewApi } from "../api/reviewApi";
import { reviewKeys } from "./useReviews";
import type { ImportResponseResult } from "../api/reviewApi";

/**
 * Parses an iteration's stored raw response again (useful for old outputs after
 * parser improvements). Settles only once the review has been refetched, so the
 * caller's result summary and the review's comments change together.
 */
export const useReparseIteration = (
  reviewId: string
): UseMutationResult<ImportResponseResult, Error, string> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (iterationId: string) => reviewApi.reparseIteration(reviewId, iterationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.detail(reviewId) }),
  });
};
