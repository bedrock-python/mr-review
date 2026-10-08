import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { reviewApi } from "../api/reviewApi";
import type { PostReviewOptions } from "../api/reviewApi";
import type { PostReviewResult } from "./post.schema";
import { reviewKeys } from "./useReviews";

/**
 * Posts an iteration's comments to its MR. The answer carries the review with every comment's
 * outcome, which replaces the cached one; after a failure the review is read again, since the
 * server records each comment as it goes and some may have landed before the error.
 */
export const usePostReview = (
  reviewId: string
): UseMutationResult<PostReviewResult, Error, PostReviewOptions> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (options: PostReviewOptions) => reviewApi.post(reviewId, options),
    onSuccess: (result) => {
      qc.setQueryData(reviewKeys.detail(reviewId), result.review);
      void qc.invalidateQueries({ queryKey: reviewKeys.lists() });
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: reviewKeys.detail(reviewId) });
    },
  });
};
