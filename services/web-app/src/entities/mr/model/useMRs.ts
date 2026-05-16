import { useQuery } from "@tanstack/react-query";
import { mrApi } from "../api/mrApi";
import type { GetMRsParams } from "../api/mrApi";

export const mrKeys = {
  all: ["mrs"] as const,
  repos: (hostId: string, query?: string) => [...mrKeys.all, "repos", hostId, query ?? ""] as const,
  inbox: (hostId: string) => [...mrKeys.all, "inbox", hostId] as const,
  lists: (hostId: string, repoPath: string) => [...mrKeys.all, "list", hostId, repoPath] as const,
  list: (hostId: string, repoPath: string, params: GetMRsParams) =>
    [...mrKeys.lists(hostId, repoPath), params] as const,
  details: (hostId: string, repoPath: string) =>
    [...mrKeys.all, "detail", hostId, repoPath] as const,
  detail: (hostId: string, repoPath: string, mrIid: number) =>
    [...mrKeys.details(hostId, repoPath), mrIid] as const,
  diff: (hostId: string, repoPath: string, mrIid: number) =>
    [...mrKeys.all, "diff", hostId, repoPath, mrIid] as const,
};

export const useRepos = (
  hostId: string | null,
  query?: string
): ReturnType<typeof useQuery<Awaited<ReturnType<typeof mrApi.listRepos>>>> => {
  const isEnabled = hostId !== null && (query === undefined || query.length >= 2);
  return useQuery({
    queryKey: mrKeys.repos(hostId ?? "", query),
    queryFn: () => {
      if (hostId === null) return Promise.reject(new Error("hostId is null"));
      return mrApi.listRepos(hostId, query);
    },
    enabled: isEnabled,
    staleTime: 2 * 60 * 1000,
  });
};

export const useMRs = (
  hostId: string | null,
  repoPath: string | null,
  params: GetMRsParams = {}
): ReturnType<typeof useQuery<Awaited<ReturnType<typeof mrApi.listMRs>>>> => {
  return useQuery({
    queryKey: mrKeys.list(hostId ?? "", repoPath ?? "", params),
    queryFn: () => {
      if (hostId === null || repoPath === null) return Promise.reject(new Error("null params"));
      return mrApi.listMRs(hostId, repoPath, params);
    },
    enabled: hostId !== null && repoPath !== null,
    staleTime: 2 * 60 * 1000,
  });
};

export const useMR = (
  hostId: string | null,
  repoPath: string | null,
  mrIid: number | null
): ReturnType<typeof useQuery<Awaited<ReturnType<typeof mrApi.getMR>>>> => {
  return useQuery({
    queryKey: mrKeys.detail(hostId ?? "", repoPath ?? "", mrIid ?? 0),
    queryFn: () => {
      if (hostId === null || repoPath === null || mrIid === null)
        return Promise.reject(new Error("null params"));
      return mrApi.getMR(hostId, repoPath, mrIid);
    },
    enabled: hostId !== null && repoPath !== null && mrIid !== null,
    staleTime: 10 * 60 * 1000,
  });
};

export const useInboxMRs = (
  hostId: string | null
): ReturnType<typeof useQuery<Awaited<ReturnType<typeof mrApi.listInboxMRs>>>> => {
  return useQuery({
    queryKey: mrKeys.inbox(hostId ?? ""),
    queryFn: () => {
      if (hostId === null) return Promise.reject(new Error("hostId is null"));
      return mrApi.listInboxMRs(hostId);
    },
    enabled: hostId !== null,
    staleTime: 2 * 60 * 1000,
  });
};

export const useDiff = (
  hostId: string | null,
  repoPath: string | null,
  mrIid: number | null
): ReturnType<typeof useQuery<Awaited<ReturnType<typeof mrApi.getDiff>>>> => {
  return useQuery({
    queryKey: mrKeys.diff(hostId ?? "", repoPath ?? "", mrIid ?? 0),
    queryFn: () => {
      if (hostId === null || repoPath === null || mrIid === null)
        return Promise.reject(new Error("null params"));
      return mrApi.getDiff(hostId, repoPath, mrIid);
    },
    enabled: hostId !== null && repoPath !== null && mrIid !== null,
    staleTime: 10 * 60 * 1000,
  });
};
