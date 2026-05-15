import { z } from "zod";

import { httpClient } from "@shared/api";

import { AIProviderSchema } from "../model/aiProvider.schema";
import type { AIProvider, CreateAIProvider, UpdateAIProvider } from "../model/aiProvider.schema";

export const aiProviderApi = {
  list: async (): Promise<AIProvider[]> => {
    const res = await httpClient.get<unknown>("/api/v1/ai-providers");
    return z.array(AIProviderSchema).parse(res.data);
  },

  create: async (data: CreateAIProvider): Promise<AIProvider> => {
    const res = await httpClient.post<unknown>("/api/v1/ai-providers", data);
    return AIProviderSchema.parse(res.data);
  },

  update: async (id: string, data: UpdateAIProvider): Promise<AIProvider> => {
    const res = await httpClient.patch<unknown>(`/api/v1/ai-providers/${id}`, data);
    return AIProviderSchema.parse(res.data);
  },

  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/api/v1/ai-providers/${id}`);
  },

  fetchModels: async (id: string): Promise<string[]> => {
    const res = await httpClient.get<unknown>(`/api/v1/ai-providers/${id}/models`);
    return z.array(z.string()).parse(res.data);
  },
};
