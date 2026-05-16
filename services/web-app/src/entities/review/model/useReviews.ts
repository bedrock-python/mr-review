import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { reviewApi } from "../api/reviewApi";
import type { UpdateCommentInput } from "../api/reviewApi";
import type { Review, BriefConfig, IterationStage } from "./review.schema";

export const reviewKeys = {
  all: ["reviews"] as const,
  lists: () => [...reviewKeys.all, "list"] as const,
  details: () => [...reviewKeys.all, "detail"] as const,
  detail: (id: string) => [...reviewKeys.details(), id] as const,
};

export const useReviews = (): UseQueryResult<Review[]> =>
  useQuery({
    queryKey: reviewKeys.lists(),
    queryFn: reviewApi.list,
    staleTime: 30_000,
  });

export const useReview = (reviewId: string | null): UseQueryResult<Review> =>
  useQuery({
    queryKey: reviewKeys.detail(reviewId ?? ""),
    queryFn: () => {
      if (reviewId === null) return Promise.reject(new Error("reviewId is null"));
      return reviewApi.get(reviewId);
    },
    enabled: reviewId !== null,
    staleTime: 30_000,
  });

export const useCreateReview = (): UseMutationResult<
  Review,
  Error,
  { host_id: string; repo_path: string; mr_iid: number }
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reviewApi.create,
    onSuccess: (review) => {
      qc.setQueryData(reviewKeys.detail(review.id), review);
    },
    onError: (err) => {
      toast.error("Failed to create review", { description: err.message });
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
      qc.setQueryData(reviewKeys.detail(reviewId), updated);
    },
    onError: (err) => {
      toast.error("Failed to update review", { description: err.message });
    },
  });
};
