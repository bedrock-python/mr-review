import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { aiProviderApi } from "../api/aiProviderApi";
import type { CreateAIProvider, UpdateAIProvider } from "./aiProvider.schema";

export const aiProviderKeys = {
  all: ["ai-providers"] as const,
  lists: () => [...aiProviderKeys.all, "list"] as const,
};

export const useAIProviders = (): ReturnType<
  typeof useQuery<Awaited<ReturnType<typeof aiProviderApi.list>>>
> => {
  return useQuery({
    queryKey: aiProviderKeys.lists(),
    queryFn: aiProviderApi.list,
    staleTime: 15 * 60 * 1000,
  });
};

export const useCreateAIProvider = (): ReturnType<
  typeof useMutation<Awaited<ReturnType<typeof aiProviderApi.create>>, Error, CreateAIProvider>
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAIProvider) => aiProviderApi.create(data),
    onSuccess: (provider) => {
      void qc.invalidateQueries({ queryKey: aiProviderKeys.lists() });
      toast.success(`Provider "${provider.name}" added`);
    },
    onError: (err) => {
      toast.error("Failed to add provider", { description: err.message });
    },
  });
};

export const useUpdateAIProvider = (): ReturnType<
  typeof useMutation<
    Awaited<ReturnType<typeof aiProviderApi.update>>,
    Error,
    { id: string; data: UpdateAIProvider }
  >
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => aiProviderApi.update(id, data),
    onSuccess: (provider) => {
      qc.setQueryData(
        aiProviderKeys.lists(),
        (old: Awaited<ReturnType<typeof aiProviderApi.list>> | undefined) =>
          old?.map((p) => (p.id === provider.id ? provider : p)) ?? [provider]
      );
      void qc.invalidateQueries({ queryKey: aiProviderKeys.lists() });
      toast.success(`Provider "${provider.name}" updated`);
    },
    onError: (err) => {
      toast.error("Failed to update provider", { description: err.message });
    },
  });
};

export const useDeleteAIProvider = (): ReturnType<typeof useMutation<void, Error, string>> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aiProviderApi.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: aiProviderKeys.lists() });
      toast.success("Provider removed");
    },
    onError: (err) => {
      toast.error("Failed to remove provider", { description: err.message });
    },
  });
};
