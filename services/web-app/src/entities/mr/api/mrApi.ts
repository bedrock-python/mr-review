import { z } from "zod";
import { httpClient } from "@shared/api";
import {
  MRSchema,
  DiffFileSchema,
  RepoPageSchema,
  MRPageSchema,
  InboxMRPageSchema,
} from "../model/mr.schema";
import type {
  MR,
  DiffFile,
  InboxScope,
  MRStateFilter,
  RepoPage,
  MRPage,
  InboxMRPage,
} from "../model/mr.schema";

/** Page sizes requested from the backend (its defaults, sent explicitly). */
export const REPOS_PAGE_SIZE = 50;
export const MRS_PAGE_SIZE = 30;
export const INBOX_PAGE_SIZE = 30;

export type ListReposParams = {
  /** Server-side search; empty or omitted lists everything. */
  q?: string | undefined;
  page: number;
  perPage: number;
};

export type ListMRsParams = {
  state: MRStateFilter;
  /** Server-side title search; empty or omitted lists everything. */
  q?: string | undefined;
  page: number;
  perPage: number;
};

export type ListInboxMRsParams = {
  scope: InboxScope;
  page: number;
  perPage: number;
};

type RequestOptions = { signal?: AbortSignal };

const toRequestOptions = (signal: AbortSignal | undefined): RequestOptions =>
  signal ? { signal } : {};

const toSearchParam = (q: string | undefined): string | undefined => {
  const trimmed = q?.trim();
  if (!trimmed) return undefined;
  return trimmed;
};

export const mrApi = {
  listRepos: async (
    hostId: string,
    { q, page, perPage }: ListReposParams,
    signal?: AbortSignal
  ): Promise<RepoPage> => {
    const res = await httpClient.get<unknown>(`/api/v1/hosts/${hostId}/repos`, {
      params: { q: toSearchParam(q), page, per_page: perPage },
      ...toRequestOptions(signal),
    });
    return RepoPageSchema.parse(res.data);
  },

  listMRs: async (
    hostId: string,
    repoPath: string,
    { state, q, page, perPage }: ListMRsParams,
    signal?: AbortSignal
  ): Promise<MRPage> => {
    const res = await httpClient.get<unknown>(`/api/v1/hosts/${hostId}/repos/${repoPath}/mrs`, {
      params: { state, q: toSearchParam(q), page, per_page: perPage },
      ...toRequestOptions(signal),
    });
    return MRPageSchema.parse(res.data);
  },

  getMR: async (hostId: string, repoPath: string, mrIid: number): Promise<MR> => {
    const res = await httpClient.get<unknown>(
      `/api/v1/hosts/${hostId}/repos/${repoPath}/mrs/${String(mrIid)}`
    );
    return MRSchema.parse(res.data);
  },

  listInboxMRs: async (
    hostId: string,
    { scope, page, perPage }: ListInboxMRsParams,
    signal?: AbortSignal
  ): Promise<InboxMRPage> => {
    const res = await httpClient.get<unknown>(`/api/v1/hosts/${hostId}/inbox`, {
      params: { scope, page, per_page: perPage },
      ...toRequestOptions(signal),
    });
    return InboxMRPageSchema.parse(res.data);
  },

  getDiff: async (hostId: string, repoPath: string, mrIid: number): Promise<DiffFile[]> => {
    const res = await httpClient.get<unknown>(
      `/api/v1/hosts/${hostId}/repos/${repoPath}/mrs/${String(mrIid)}/diff`
    );
    return z.array(DiffFileSchema).parse(res.data);
  },
};
