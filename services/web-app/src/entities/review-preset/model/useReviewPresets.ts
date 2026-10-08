import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { toast } from "sonner";

import { reviewPresetApi } from "../api/reviewPresetApi";
import type {
  BuiltinPreset,
  CreateReviewPresetInput,
  ReviewPreset,
  UpdateReviewPresetInput,
} from "./reviewPreset.schema";

const PRESETS_STALE_MS = 5 * 60 * 1000;

export const reviewPresetKeys = {
  all: ["review-presets"] as const,
  lists: () => [...reviewPresetKeys.all, "list"] as const,
  builtin: () => [...reviewPresetKeys.all, "builtin"] as const,
};

export const useReviewPresets = (): UseQueryResult<ReviewPreset[]> =>
  useQuery({
    queryKey: reviewPresetKeys.lists(),
    queryFn: reviewPresetApi.list,
    staleTime: PRESETS_STALE_MS,
  });

/** The built-in presets' texts never change while the server runs. */
export const useBuiltinPresets = (): UseQueryResult<BuiltinPreset[]> =>
  useQuery({
    queryKey: reviewPresetKeys.builtin(),
    queryFn: reviewPresetApi.listBuiltin,
    staleTime: Infinity,
  });

export const useCreateReviewPreset = (): UseMutationResult<
  ReviewPreset,
  Error,
  CreateReviewPresetInput
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateReviewPresetInput) => reviewPresetApi.create(data),
    onSuccess: (preset) => {
      qc.setQueryData<ReviewPreset[]>(reviewPresetKeys.lists(), (old) => [...(old ?? []), preset]);
      toast.success(`Preset "${preset.name}" saved`);
    },
  });
};

export const useUpdateReviewPreset = (): UseMutationResult<
  ReviewPreset,
  Error,
  { id: string; data: UpdateReviewPresetInput }
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => reviewPresetApi.update(id, data),
    onSuccess: (preset) => {
      qc.setQueryData<ReviewPreset[]>(reviewPresetKeys.lists(), (old) =>
        (old ?? []).map((p) => (p.id === preset.id ? preset : p))
      );
      toast.success(`Preset "${preset.name}" updated`);
    },
  });
};

export const useDeleteReviewPreset = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reviewPresetApi.delete(id),
    onSuccess: (_, id) => {
      qc.setQueryData<ReviewPreset[]>(reviewPresetKeys.lists(), (old) =>
        (old ?? []).filter((p) => p.id !== id)
      );
      toast.success("Preset deleted");
    },
    onError: (err) => {
      toast.error("Failed to delete preset", { description: err.message });
    },
  });
};
