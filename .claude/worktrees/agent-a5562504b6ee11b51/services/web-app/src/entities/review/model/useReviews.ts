import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import { reviewApi } from "../api/reviewApi";
import type { Review, BriefConfig, ReviewStage } from "./review.schema";

export const reviewKeys = {
  all: ["reviews"] as const,
  lists: () => [...reviewKeys.all, "list"] as const,
  details: () => [...reviewKeys.all, "detail"] as const,
  detail: (id: string) => [...reviewKeys.details(), id] as const,
};

export const useReview = (reviewId: string | null): UseQueryResult<Review> =>
  useQuery({
    queryKey: reviewKeys.detail(reviewId ?? ""),
    queryFn: () => reviewApi.get(reviewId!),
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
  });
};

export const useUpdateReview = (
  reviewId: string,
): UseMutationResult<
  Review,
  Error,
  { stage?: ReviewStage; brief_config?: BriefConfig }
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { stage?: ReviewStage; brief_config?: BriefConfig }) =>
      reviewApi.update(reviewId, data),
    onSuccess: (updated) => {
      qc.setQueryData(reviewKeys.detail(reviewId), updated);
    },
  });
};
