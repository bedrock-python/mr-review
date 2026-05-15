import { useQuery } from "@tanstack/react-query";
import { mrApi } from "../api/mrApi";
import type { GetMRsParams } from "../api/mrApi";

export const mrKeys = {
  all: ["mrs"] as const,
  repos: (hostId: string) => [...mrKeys.all, "repos", hostId] as const,
  lists: (hostId: string, repoPath: string) =>
    [...mrKeys.all, "list", hostId, repoPath] as const,
  list: (hostId: string, repoPath: string, params: GetMRsParams) =>
    [...mrKeys.lists(hostId, repoPath), params] as const,
  details: (hostId: string, repoPath: string) =>
    [...mrKeys.all, "detail", hostId, repoPath] as const,
  detail: (hostId: string, repoPath: string, mrIid: number) =>
    [...mrKeys.details(hostId, repoPath), mrIid] as const,
  diff: (hostId: string, repoPath: string, mrIid: number) =>
    [...mrKeys.all, "diff", hostId, repoPath, mrIid] as const,
};

export const useRepos = (hostId: string | null): ReturnType<typeof useQuery<Awaited<ReturnType<typeof mrApi.listRepos>>>> => {
  return useQuery({
    queryKey: mrKeys.repos(hostId ?? ""),
    queryFn: () => mrApi.listRepos(hostId!),
    enabled: hostId !== null,
    staleTime: 5 * 60 * 1000,
  });
};

export const useMRs = (
  hostId: string | null,
  repoPath: string | null,
  params: GetMRsParams = {},
): ReturnType<typeof useQuery<Awaited<ReturnType<typeof mrApi.listMRs>>>> => {
  return useQuery({
    queryKey: mrKeys.list(hostId ?? "", repoPath ?? "", params),
    queryFn: () => mrApi.listMRs(hostId!, repoPath!, params),
    enabled: hostId !== null && repoPath !== null,
    staleTime: 2 * 60 * 1000,
  });
};

export const useMR = (
  hostId: string | null,
  repoPath: string | null,
  mrIid: number | null,
): ReturnType<typeof useQuery<Awaited<ReturnType<typeof mrApi.getMR>>>> => {
  return useQuery({
    queryKey: mrKeys.detail(hostId ?? "", repoPath ?? "", mrIid ?? 0),
    queryFn: () => mrApi.getMR(hostId!, repoPath!, mrIid!),
    enabled: hostId !== null && repoPath !== null && mrIid !== null,
    staleTime: 2 * 60 * 1000,
  });
};

export const useDiff = (
  hostId: string | null,
  repoPath: string | null,
  mrIid: number | null,
): ReturnType<typeof useQuery<Awaited<ReturnType<typeof mrApi.getDiff>>>> => {
  return useQuery({
    queryKey: mrKeys.diff(hostId ?? "", repoPath ?? "", mrIid ?? 0),
    queryFn: () => mrApi.getDiff(hostId!, repoPath!, mrIid!),
    enabled: hostId !== null && repoPath !== null && mrIid !== null,
    staleTime: 10 * 60 * 1000,
  });
};
