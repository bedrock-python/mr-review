import { z } from "zod";
import { httpClient } from "@shared/api";
import { HostSchema, AddRepoByUrlResponseSchema } from "../model/host.schema";
import type {
  CreateHost,
  UpdateHost,
  Host,
  AddRepoByUrlResponse,
} from "../model/host.schema";

export type TestConnectionResult = {
  ok: boolean;
  user?: string;
};

export const hostApi = {
  list: async (): Promise<Host[]> => {
    const res = await httpClient.get<unknown>("/api/v1/hosts");
    return z.array(HostSchema).parse(res.data);
  },

  create: async (data: CreateHost): Promise<Host> => {
    const res = await httpClient.post<unknown>("/api/v1/hosts", data);
    return HostSchema.parse(res.data);
  },

  update: async (id: string, data: UpdateHost): Promise<Host> => {
    const res = await httpClient.patch<unknown>(`/api/v1/hosts/${id}`, data);
    return HostSchema.parse(res.data);
  },

  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/api/v1/hosts/${id}`);
  },

  test: async (id: string): Promise<TestConnectionResult> => {
    const res = await httpClient.get<TestConnectionResult>(`/api/v1/hosts/${id}/test`);
    return res.data;
  },

  toggleFavouriteRepo: async (id: string, repoPath: string): Promise<Host> => {
    const encoded = encodeURIComponent(repoPath);
    const res = await httpClient.post<unknown>(`/api/v1/hosts/${id}/favourite-repos/${encoded}`);
    return HostSchema.parse(res.data);
  },

  addRepoByUrl: async (id: string, url: string): Promise<AddRepoByUrlResponse> => {
    const res = await httpClient.post<unknown>(`/api/v1/hosts/${id}/repos/add-by-url`, { url });
    return AddRepoByUrlResponseSchema.parse(res.data);
  },
};
