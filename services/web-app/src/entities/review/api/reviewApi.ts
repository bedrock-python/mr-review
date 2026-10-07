import { z } from "zod";
import { ApiError, httpClient } from "@shared/api";
import { env } from "@shared/config";
import { readEventStream } from "@shared/lib";
import { ReviewSchema } from "../model/review.schema";
import { parseDispatchStreamEvent } from "./parseDispatchStreamEvent";
import type { DispatchRequest, DispatchStreamEvent } from "../model/dispatch.schema";
import type { Review, BriefConfig, Comment } from "../model/review.schema";

const HTTP_NOT_FOUND = 404;

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

export type UpdateCommentInput = {
  id: string;
  status?: "kept" | "dismissed";
  body?: string;
  severity?: Comment["severity"];
  resolved?: boolean;
  // An explicit null clears the anchor (file) or just the line; omit a key to leave it as is.
  file?: string | null;
  line?: number | null;
};

export type NewCommentInput = {
  file: string | null;
  line: number | null;
  severity: Comment["severity"];
  body: string;
};

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
    data: {
      brief_config?: BriefConfig;
      iteration_id?: string;
      iteration_stage?: "brief" | "dispatch" | "polish" | "post";
      iteration_comments?: UpdateCommentInput[];
    }
  ): Promise<Review> => {
    const res = await httpClient.patch<unknown>(`/api/v1/reviews/${reviewId}`, data);
    return ReviewSchema.parse(res.data);
  },

  createIteration: async (reviewId: string, briefConfig?: BriefConfig): Promise<Review> => {
    const res = await httpClient.post<unknown>(`/api/v1/reviews/${reviewId}/iterations`, {
      brief_config: briefConfig ?? null,
    });
    return ReviewSchema.parse(res.data);
  },

  getDiff: async (reviewId: string): Promise<string> => {
    const res = await httpClient.get<string>(`/api/v1/reviews/${reviewId}/diff`);
    return res.data;
  },

  delete: async (reviewId: string): Promise<void> => {
    await httpClient.delete(`/api/v1/reviews/${reviewId}`);
  },

  getContext: async (reviewId: string): Promise<string> => {
    const res = await httpClient.get<string>(`/api/v1/reviews/${reviewId}/context`);
    return res.data;
  },

  getPrompt: async (
    reviewId: string,
    briefConfig?: BriefConfig,
    iterationId?: string
  ): Promise<string> => {
    const res = await httpClient.post<string>(`/api/v1/reviews/${reviewId}/prompt`, {
      brief_config: briefConfig ?? null,
      iteration_id: iterationId ?? null,
    });
    return res.data;
  },

  // Runs the review through an AI provider over SSE. Yields the raw text and
  // comment previews as they stream, then ends after exactly one terminal
  // `done` or `error` event; throws if the stream ends without one.
  dispatchStream: async function* (
    reviewId: string,
    request: DispatchRequest,
    signal?: AbortSignal
  ): AsyncGenerator<DispatchStreamEvent, void, undefined> {
    const response = await fetch(`${env.VITE_API_BASE_URL}/api/v1/reviews/${reviewId}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ai_provider_id: request.aiProviderId,
        model: request.model ?? null,
        temperature: request.temperature ?? null,
        reasoning_budget: request.reasoningBudget ?? null,
        reasoning_effort: request.reasoningEffort ?? null,
        max_output_tokens: request.maxOutputTokens ?? null,
        structured_output: request.structuredOutput ?? null,
        system_prompt: request.systemPrompt ?? null,
        iteration_id: request.iterationId ?? null,
      }),
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

    for await (const message of readEventStream(response.body)) {
      const event = parseDispatchStreamEvent(message.event, message.data);
      if (event === null) continue;
      yield event;
      if (event.type === "done" || event.type === "error") return;
    }
    throw new Error("Dispatch stream ended before the server reported a result");
  },

  importResponse: async (
    reviewId: string,
    raw: string,
    iterationId?: string | null
  ): Promise<ImportResponseResult> => {
    const res = await httpClient.post<unknown>(`/api/v1/reviews/${reviewId}/import-response`, {
      raw,
      iteration_id: iterationId ?? null,
    });
    return ImportResponseResultSchema.parse(res.data);
  },

  post: async (
    reviewId: string,
    diff_refs?: Record<string, string>,
    iterationId?: string | null,
    fallbackToGeneralNote = true
  ): Promise<{ posted: number }> => {
    const res = await httpClient.post<unknown>(`/api/v1/reviews/${reviewId}/post`, {
      diff_refs: diff_refs ?? {},
      iteration_id: iterationId ?? null,
      fallback_to_general_note: fallbackToGeneralNote,
    });
    return res.data as { posted: number };
  },

  addComment: async (
    reviewId: string,
    iterationId: string,
    input: NewCommentInput
  ): Promise<Review> => {
    const res = await httpClient.post<unknown>(
      `/api/v1/reviews/${reviewId}/iterations/${iterationId}/comments`,
      input
    );
    return ReviewSchema.parse(res.data);
  },

  deleteComment: async (
    reviewId: string,
    iterationId: string,
    commentId: string
  ): Promise<Review> => {
    const res = await httpClient.delete<unknown>(
      `/api/v1/reviews/${reviewId}/iterations/${iterationId}/comments/${commentId}`
    );
    return ReviewSchema.parse(res.data);
  },

  // The model output an iteration was parsed from, exactly as received;
  // null when none was stored for it.
  getRawResponse: async (reviewId: string, iterationId: string): Promise<string | null> => {
    try {
      const res = await httpClient.get<unknown>(
        `/api/v1/reviews/${reviewId}/iterations/${iterationId}/raw-response`,
        // Keep the body as text: axios would otherwise parse output that is valid JSON.
        { responseType: "text" }
      );
      return z.string().parse(res.data);
    } catch (err) {
      if (err instanceof ApiError && err.status === HTTP_NOT_FOUND) return null;
      throw err;
    }
  },

  // Parses the iteration's stored raw response again; reports like importResponse.
  reparseIteration: async (
    reviewId: string,
    iterationId: string
  ): Promise<ImportResponseResult> => {
    const res = await httpClient.post<unknown>(
      `/api/v1/reviews/${reviewId}/iterations/${iterationId}/reparse`
    );
    return ImportResponseResultSchema.parse(res.data);
  },
};
