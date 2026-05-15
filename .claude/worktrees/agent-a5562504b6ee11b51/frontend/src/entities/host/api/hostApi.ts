import { z } from "zod";
import { httpClient } from "@shared/api";
import { HostSchema } from "../model/host.schema";
import type { CreateHost, Host } from "../model/host.schema";

export type TestConnectionResult = {
  ok: boolean;
  user?: string;
};

export const hostApi = {
  list: async (): Promise<Host[]> => {
    const res = await httpClient.get<unknown>("/api/hosts");
    return z.array(HostSchema).parse(res.data);
  },

  create: async (data: CreateHost): Promise<Host> => {
    const res = await httpClient.post<unknown>("/api/hosts", data);
    return HostSchema.parse(res.data);
  },

  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/api/hosts/${id}`);
  },

  test: async (id: string): Promise<TestConnectionResult> => {
    const res = await httpClient.get<TestConnectionResult>(`/api/hosts/${id}/test`);
    return res.data;
  },
};
