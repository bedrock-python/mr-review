import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hostApi } from "../api/hostApi";
import type { AddRepoByUrlResponse, CreateHost, Host, UpdateHost } from "./host.schema";

export const hostKeys = {
  all: ["hosts"] as const,
  lists: () => [...hostKeys.all, "list"] as const,
};

export const useHosts = (): ReturnType<
  typeof useQuery<Awaited<ReturnType<typeof hostApi.list>>>
> => {
  return useQuery({
    queryKey: hostKeys.lists(),
    queryFn: hostApi.list,
    staleTime: 15 * 60 * 1000,
  });
};

export const useCreateHost = (): ReturnType<
  typeof useMutation<Awaited<ReturnType<typeof hostApi.create>>, Error, CreateHost>
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateHost) => hostApi.create(data),
    onSuccess: (host) => {
      void qc.invalidateQueries({ queryKey: hostKeys.lists() });
      toast.success(`Host "${host.name}" added`);
    },
    onError: (err) => {
      toast.error("Failed to add host", { description: err.message });
    },
  });
};

export const useUpdateHost = (): ReturnType<
  typeof useMutation<
    Awaited<ReturnType<typeof hostApi.update>>,
    Error,
    { id: string; data: UpdateHost }
  >
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => hostApi.update(id, data),
    onSuccess: (host) => {
      void qc.invalidateQueries({ queryKey: hostKeys.lists() });
      toast.success(`Host "${host.name}" updated`);
    },
    onError: (err) => {
      toast.error("Failed to update host", { description: err.message });
    },
  });
};

export const useDeleteHost = (): ReturnType<typeof useMutation<void, Error, string>> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hostApi.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: hostKeys.lists() });
      toast.success("Host removed");
    },
    onError: (err) => {
      toast.error("Failed to remove host", { description: err.message });
    },
  });
};

export const useToggleFavouriteRepo = (): ReturnType<
  typeof useMutation<Host, Error, { hostId: string; repoPath: string }>
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ hostId, repoPath }) => hostApi.toggleFavouriteRepo(hostId, repoPath),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: hostKeys.lists() });
    },
    onError: (err) => {
      toast.error("Failed to update favourites", { description: err.message });
    },
  });
};

export const useAddRepoByUrl = (): ReturnType<
  typeof useMutation<AddRepoByUrlResponse, Error, { hostId: string; url: string }>
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ hostId, url }) => hostApi.addRepoByUrl(hostId, url),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: hostKeys.lists() });
      void qc.invalidateQueries({ queryKey: ["mrs", "repos"] });
      toast.success(`Pinned ${result.repo_path}`);
    },
    onError: (err) => {
      toast.error("Failed to add repository", { description: err.message });
    },
  });
};
