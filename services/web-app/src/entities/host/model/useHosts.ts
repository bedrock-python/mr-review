import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hostApi } from "../api/hostApi";
import type { CreateHost, UpdateHost } from "./host.schema";

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
