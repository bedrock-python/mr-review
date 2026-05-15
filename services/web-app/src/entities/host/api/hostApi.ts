import { z } from "zod";
import { httpClient } from "@shared/api";
import { HostSchema } from "../model/host.schema";
import type { CreateHost, UpdateHost, Host } from "../model/host.schema";

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
};
