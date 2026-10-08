import { z } from "zod";

import { httpClient } from "@shared/api";

import { BuiltinPresetSchema, ReviewPresetSchema } from "../model/reviewPreset.schema";
import type {
  BuiltinPreset,
  CreateReviewPresetInput,
  ReviewPreset,
  UpdateReviewPresetInput,
} from "../model/reviewPreset.schema";

const BASE = "/api/v1/review-presets";

export const reviewPresetApi = {
  list: async (): Promise<ReviewPreset[]> => {
    const res = await httpClient.get<unknown>(BASE);
    return z.array(ReviewPresetSchema).parse(res.data);
  },

  listBuiltin: async (): Promise<BuiltinPreset[]> => {
    const res = await httpClient.get<unknown>(`${BASE}/builtin`);
    return z.array(BuiltinPresetSchema).parse(res.data);
  },

  create: async (data: CreateReviewPresetInput): Promise<ReviewPreset> => {
    const res = await httpClient.post<unknown>(BASE, data);
    return ReviewPresetSchema.parse(res.data);
  },

  update: async (id: string, data: UpdateReviewPresetInput): Promise<ReviewPreset> => {
    const res = await httpClient.patch<unknown>(`${BASE}/${id}`, data);
    return ReviewPresetSchema.parse(res.data);
  },

  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`${BASE}/${id}`);
  },
};
