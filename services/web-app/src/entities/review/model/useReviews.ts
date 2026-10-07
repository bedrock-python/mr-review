import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient, UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@shared/api";
import { reviewApi } from "../api/reviewApi";
import type { UpdateCommentInput } from "../api/reviewApi";
import type { Review, BriefConfig, IterationStage } from "./review.schema";

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const REVIEW_STALE_MS = 30_000;
// The full list is large (every review with every comment): keep it only while shown.
const REVIEW_LIST_GC_MS = 60_000;

export const reviewKeys = {
  all: ["reviews"] as const,
  lists: () => [...reviewKeys.all, "list"] as const,
  details: () => [...reviewKeys.all, "detail"] as const,
  detail: (id: string) => [...reviewKeys.details(), id] as const,
};

/** Stores the server's copy of a changed review and marks the history list stale. */
const storeReview = (qc: QueryClient, review: Review): void => {
  qc.setQueryData(reviewKeys.detail(review.id), review);
  void qc.invalidateQueries({ queryKey: reviewKeys.lists() });
};

export type UseReviewsOptions = {
  /** Fetch only while something shows the list. */
  isEnabled?: boolean;
};

export const useReviews = ({ isEnabled = true }: UseReviewsOptions = {}): UseQueryResult<
  Review[]
> =>
  useQuery({
    queryKey: reviewKeys.lists(),
    queryFn: reviewApi.list,
    enabled: isEnabled,
    staleTime: REVIEW_STALE_MS,
    gcTime: REVIEW_LIST_GC_MS,
    // Posting from the Post stage changes a review without going through these hooks.
    refetchOnMount: "always",
    // The history panel shows its own error state.
    meta: { silent: true },
  });

export const useReview = (reviewId: string | null): UseQueryResult<Review> =>
  useQuery({
    queryKey: reviewKeys.detail(reviewId ?? ""),
    queryFn: () => {
      if (reviewId === null) return Promise.reject(new Error("reviewId is null"));
      return reviewApi.get(reviewId);
    },
    enabled: reviewId !== null,
    staleTime: REVIEW_STALE_MS,
    // A review that no longer exists is taken out of the URL by the stage bar.
    meta: { silentStatuses: [HTTP_NOT_FOUND] },
  });

export const isReviewNotFound = (error: unknown): boolean =>
  error instanceof ApiError && error.status === HTTP_NOT_FOUND;

export const useCreateReview = (): UseMutationResult<
  Review,
  Error,
  { host_id: string; repo_path: string; mr_iid: number }
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reviewApi.create,
    onSuccess: (review) => {
      storeReview(qc, review);
    },
    onError: (err) => {
      toast.error("Failed to create review", { description: err.message });
    },
  });
};

export type CreateIterationInput = {
  reviewId: string;
  /** Brief of the new iteration; omitted uses the review's default. */
  briefConfig?: BriefConfig;
};

/** Starts a new round on a review, or returns its last iteration while that is still open. */
export const useCreateIteration = (): UseMutationResult<Review, Error, CreateIterationInput> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, briefConfig }: CreateIterationInput) =>
      reviewApi.createIteration(reviewId, briefConfig),
    onSuccess: (review) => {
      storeReview(qc, review);
    },
    onError: (err) => {
      toast.error("Failed to start a new iteration", { description: err.message });
    },
  });
};

export const useDeleteReview = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => reviewApi.delete(reviewId),
    onSuccess: (_, reviewId) => {
      qc.removeQueries({ queryKey: reviewKeys.detail(reviewId) });
      void qc.invalidateQueries({ queryKey: reviewKeys.lists() });
    },
    onError: (err) => {
      toast.error("Failed to delete review", { description: err.message });
    },
  });
};

export type UpdateReviewInput = {
  brief_config?: BriefConfig;
  iteration_id?: string;
  iteration_stage?: IterationStage;
  iteration_comments?: UpdateCommentInput[];
};

export const useUpdateReview = (
  reviewId: string
): UseMutationResult<Review, Error, UpdateReviewInput> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateReviewInput) => reviewApi.update(reviewId, data),
    onSuccess: (updated) => {
      storeReview(qc, updated);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === HTTP_CONFLICT) {
        // The iteration was posted meanwhile (another tab, a late save): show what the
        // server has, and how to go on, instead of a bare "update failed".
        void qc.invalidateQueries({ queryKey: reviewKeys.detail(reviewId) });
        toast.error("This iteration was already posted", {
          description: "Its brief can no longer change. Open Brief again to start a new round.",
        });
        return;
      }
      toast.error("Failed to update review", { description: err.message });
    },
  });
};
