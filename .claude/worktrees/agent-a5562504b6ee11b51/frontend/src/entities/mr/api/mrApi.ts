import { z } from "zod";
import { httpClient } from "@shared/api";
import { MRSchema, RepoSchema, DiffFileSchema } from "../model/mr.schema";
import type { MR, Repo, DiffFile, MRStatus } from "../model/mr.schema";

export type GetMRsParams = {
  status?: MRStatus;
  page?: number;
  page_size?: number;
};

export const mrApi = {
  listRepos: async (hostId: string): Promise<Repo[]> => {
    const res = await httpClient.get<unknown>(`/api/hosts/${hostId}/repos`);
    return z.array(RepoSchema).parse(res.data);
  },

  listMRs: async (hostId: string, repoPath: string, params?: GetMRsParams): Promise<MR[]> => {
    const { status, ...rest } = params ?? {};
    const res = await httpClient.get<unknown>(
      `/api/hosts/${hostId}/repos/${repoPath}/mrs`,
      { params: { state: status, ...rest } },
    );
    return z.array(MRSchema).parse(res.data);
  },

  getMR: async (hostId: string, repoPath: string, mrIid: number): Promise<MR> => {
    const res = await httpClient.get<unknown>(
      `/api/hosts/${hostId}/repos/${repoPath}/mrs/${mrIid}`,
    );
    return MRSchema.parse(res.data);
  },

  getDiff: async (hostId: string, repoPath: string, mrIid: number): Promise<DiffFile[]> => {
    const res = await httpClient.get<unknown>(
      `/api/hosts/${hostId}/repos/${repoPath}/mrs/${mrIid}/diff`,
    );
    return z.array(DiffFileSchema).parse(res.data);
  },
};
