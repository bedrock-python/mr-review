import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hostApi } from "../api/hostApi";
import type { CreateHost } from "./host.schema";

export const hostKeys = {
  all: ["hosts"] as const,
  lists: () => [...hostKeys.all, "list"] as const,
};

export const useHosts = (): ReturnType<typeof useQuery<Awaited<ReturnType<typeof hostApi.list>>>> => {
  return useQuery({
    queryKey: hostKeys.lists(),
    queryFn: hostApi.list,
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreateHost = (): ReturnType<typeof useMutation<Awaited<ReturnType<typeof hostApi.create>>, Error, CreateHost>> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateHost) => hostApi.create(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: hostKeys.lists() });
    },
  });
};

export const useDeleteHost = (): ReturnType<typeof useMutation<void, Error, string>> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hostApi.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: hostKeys.lists() });
    },
  });
};
