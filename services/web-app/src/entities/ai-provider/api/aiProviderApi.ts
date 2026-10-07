import { z } from "zod";

import { httpClient, parseListOrWarn } from "@shared/api";

import { AIProviderSchema, ModelCapabilitiesSchema } from "../model/aiProvider.schema";
import type {
  AIProvider,
  CreateAIProvider,
  ModelCapabilities,
  PreviewModelsRequest,
  UpdateAIProvider,
} from "../model/aiProvider.schema";

const ModelListSchema = z.array(z.string());

export const aiProviderApi = {
  list: async (): Promise<AIProvider[]> => {
    const res = await httpClient.get<unknown>("/api/v1/ai-providers");
    return parseListOrWarn(AIProviderSchema, res.data, "AI providers");
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

  /** The models the saved provider's endpoint offers. */
  fetchModels: async (id: string): Promise<string[]> => {
    const res = await httpClient.get<unknown>(`/api/v1/ai-providers/${id}/models`);
    return ModelListSchema.parse(res.data);
  },

  /** The models an endpoint offers with settings that are not saved yet (a form being edited). */
  previewModels: async (request: PreviewModelsRequest): Promise<string[]> => {
    const res = await httpClient.post<unknown>("/api/v1/ai-providers/preview/models", request);
    return ModelListSchema.parse(res.data);
  },

  /** Which dispatch settings `model` accepts on this provider. */
  getCapabilities: async (id: string, model: string): Promise<ModelCapabilities> => {
    const res = await httpClient.get<unknown>(`/api/v1/ai-providers/${id}/capabilities`, {
      params: { model },
    });
    return ModelCapabilitiesSchema.parse(res.data);
  },
};
