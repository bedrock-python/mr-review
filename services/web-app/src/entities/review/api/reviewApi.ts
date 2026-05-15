import { z } from "zod";
import { httpClient } from "@shared/api";
import { env } from "@shared/config";
import { ReviewSchema } from "../model/review.schema";
import type { Review, BriefConfig, ReviewStage, Comment } from "../model/review.schema";

const CommentParseErrorSchema = z.object({
  index: z.number(),
  reason: z.string(),
  raw: z.string(),
});

export const ImportResponseResultSchema = z.object({
  imported: z.number(),
  errors: z.array(CommentParseErrorSchema).default([]),
  json_error: z.string().nullable().default(null),
});

export type ImportResponseResult = z.infer<typeof ImportResponseResultSchema>;
export type CommentParseError = z.infer<typeof CommentParseErrorSchema>;

export const reviewApi = {
  list: async (): Promise<Review[]> => {
    const res = await httpClient.get<unknown>("/api/v1/reviews");
    return z.array(ReviewSchema).parse(res.data);
  },

  get: async (reviewId: string): Promise<Review> => {
    const res = await httpClient.get<unknown>(`/api/v1/reviews/${reviewId}`);
    return ReviewSchema.parse(res.data);
  },

  create: async (data: { host_id: string; repo_path: string; mr_iid: number }): Promise<Review> => {
    const res = await httpClient.post<unknown>("/api/v1/reviews", data);
    return ReviewSchema.parse(res.data);
  },

  update: async (
    reviewId: string,
    data: { stage?: ReviewStage; brief_config?: BriefConfig; comments?: Comment[] }
  ): Promise<Review> => {
    const res = await httpClient.patch<unknown>(`/api/v1/reviews/${reviewId}`, data);
    return ReviewSchema.parse(res.data);
  },

  getDiff: async (reviewId: string): Promise<string> => {
    const res = await httpClient.get<string>(`/api/v1/reviews/${reviewId}/diff`);
    return res.data;
  },

  delete: async (reviewId: string): Promise<void> => {
    await httpClient.delete(`/api/v1/reviews/${reviewId}`);
  },

  getPrompt: async (reviewId: string, excludeDiff = false): Promise<string> => {
    const params = excludeDiff ? { exclude_diff: true } : undefined;
    const res = await httpClient.get<string>(`/api/v1/reviews/${reviewId}/prompt`, { params });
    return res.data;
  },

  // SSE streaming dispatch — returns AsyncGenerator of text chunks
  dispatchStream: async function* (
    reviewId: string,
    aiProviderId: string,
    signal?: AbortSignal,
    model?: string
  ): AsyncGenerator<string> {
    const response = await fetch(`${env.VITE_API_BASE_URL}/api/v1/reviews/${reviewId}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_provider_id: aiProviderId, model: model ?? null }),
      signal: signal ?? null,
    });

    if (!response.ok || !response.body) {
      let message = `Dispatch failed: ${String(response.status)}`;
      try {
        const body = (await response.json()) as Record<string, unknown>;
        if (typeof body.detail === "string") message = body.detail;
      } catch {
        // ignore JSON parse errors — keep status-based message
      }
      throw new Error(message);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value !== undefined) {
          buffer += decoder.decode(result.value, { stream: true });
        }
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const chunk = line.slice(6);
            if (chunk.length > 0) yield chunk;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  importResponse: async (reviewId: string, raw: string): Promise<ImportResponseResult> => {
    const res = await httpClient.post<unknown>(`/api/v1/reviews/${reviewId}/import-response`, {
      raw,
    });
    return ImportResponseResultSchema.parse(res.data);
  },

  post: async (
    reviewId: string,
    diff_refs?: Record<string, string>
  ): Promise<{ posted: number }> => {
    const res = await httpClient.post<unknown>(`/api/v1/reviews/${reviewId}/post`, {
      diff_refs: diff_refs ?? {},
    });
    return res.data as { posted: number };
  },
};
