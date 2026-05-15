import { z } from "zod";
import { httpClient } from "@shared/api";
import { env } from "@shared/config";
import { ReviewSchema } from "../model/review.schema";
import type { Review, BriefConfig, ReviewStage, Comment } from "../model/review.schema";

export type AIConfig = {
  provider: "claude" | "openai";
  api_key: string;
  model: string;
  base_url: string;
};

export const reviewApi = {
  list: async (): Promise<Review[]> => {
    const res = await httpClient.get<unknown>("/api/reviews");
    return z.array(ReviewSchema).parse(res.data);
  },

  get: async (reviewId: string): Promise<Review> => {
    const res = await httpClient.get<unknown>(`/api/reviews/${reviewId}`);
    return ReviewSchema.parse(res.data);
  },

  create: async (data: { host_id: string; repo_path: string; mr_iid: number }): Promise<Review> => {
    const res = await httpClient.post<unknown>("/api/reviews", data);
    return ReviewSchema.parse(res.data);
  },

  update: async (
    reviewId: string,
    data: { stage?: ReviewStage; brief_config?: BriefConfig; comments?: Comment[] },
  ): Promise<Review> => {
    const res = await httpClient.patch<unknown>(`/api/reviews/${reviewId}`, data);
    return ReviewSchema.parse(res.data);
  },

  // SSE streaming dispatch — returns AsyncGenerator of text chunks
  dispatchStream: async function* (
    reviewId: string,
    aiConfig: AIConfig,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const baseUrl = env.VITE_API_URL;
    const response = await fetch(`${baseUrl}/api/reviews/${reviewId}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ai_config: aiConfig }),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Dispatch failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const chunk = line.slice(6);
            if (chunk) yield chunk;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  post: async (reviewId: string, diff_refs?: Record<string, string>): Promise<{ posted: number }> => {
    const res = await httpClient.post<unknown>(`/api/reviews/${reviewId}/post`, {
      diff_refs: diff_refs ?? {},
    });
    return res.data as { posted: number };
  },
};
