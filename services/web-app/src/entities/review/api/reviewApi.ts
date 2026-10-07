import { z } from "zod";
import { ApiError, LONG_REQUEST_TIMEOUT_MS, httpClient } from "@shared/api";
import { env } from "@shared/config";
import { readEventStream } from "@shared/lib";
import { ReviewSchema } from "../model/review.schema";
import { ExcludedFilesSchema, PromptPreviewSchema } from "../model/prompt.schema";
import { PostReviewResultSchema } from "../model/post.schema";
import { parseDispatchStreamEvent } from "./parseDispatchStreamEvent";
import type { DispatchRequest, DispatchStreamEvent } from "../model/dispatch.schema";
import type { ExcludedFiles, PromptPreview } from "../model/prompt.schema";
import type { PostReviewResult, SeverityLabel } from "../model/post.schema";
import type { Review, BriefConfig, Comment } from "../model/review.schema";

const HTTP_NOT_FOUND = 404;
// Posting waits on the VCS host for every comment. With the client default of 30 s the browser
// gave up while the server went on posting, and a second click then posted everything twice.
const POST_TIMEOUT_MS = 10 * 60 * 1000;

export type PostReviewOptions = {
  iterationId: string | null;
  // Post a comment whose line cannot be anchored as a general note instead of failing it.
  fallbackToGeneralNote: boolean;
  severityLabel: SeverityLabel;
  // Post every kept comment again, even the ones already on the MR.
  force?: boolean;
  // Also send the comments whose last attempt was ambiguous: they may be on the MR already.
  resendAmbiguous?: boolean;
};

const CommentParseErrorSchema = z.object({
  index: z.number(),
  reason: z.string(),
  raw: z.string(),
});

export const ImportResponseResultSchema = z.object({
  imported: z.number(),
  errors: z.array(CommentParseErrorSchema).default([]),
  json_error: z.string().nullable().default(null),
  /** Parsed comments dropped by the brief's minimum severity or comment cap. */
  filtered: z.number().int().nonnegative().optional(),
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
    const res = await httpClient.get<string>(`/api/v1/reviews/${reviewId}/diff`, {
      timeout: LONG_REQUEST_TIMEOUT_MS,
    });
    return res.data;
  },

  delete: async (reviewId: string): Promise<void> => {
    await httpClient.delete(`/api/v1/reviews/${reviewId}`);
  },

  getContext: async (reviewId: string): Promise<string> => {
    const res = await httpClient.get<string>(`/api/v1/reviews/${reviewId}/context`, {
      timeout: LONG_REQUEST_TIMEOUT_MS,
    });
    return res.data;
  },

  // A POST, but read like a query: building the prompt fetches the diff, and with the
  // brief's options full files, tests and related code from the VCS host.
  getPrompt: async (
    reviewId: string,
    briefConfig?: BriefConfig,
    iterationId?: string
  ): Promise<string> => {
    const res = await httpClient.post<string>(
      `/api/v1/reviews/${reviewId}/prompt`,
      { brief_config: briefConfig ?? null, iteration_id: iterationId ?? null },
      { timeout: LONG_REQUEST_TIMEOUT_MS }
    );
    return res.data;
  },

  // The prompt with a breakdown of what each part takes and what the budget cut or left out.
  getPromptPreview: async (
    reviewId: string,
    briefConfig?: BriefConfig,
    iterationId?: string
  ): Promise<PromptPreview> => {
    const res = await httpClient.post<unknown>(
      `/api/v1/reviews/${reviewId}/prompt/preview`,
      { brief_config: briefConfig ?? null, iteration_id: iterationId ?? null },
      { timeout: LONG_REQUEST_TIMEOUT_MS }
    );
    return PromptPreviewSchema.parse(res.data);
  },

  // Which changed files the brief's include/exclude patterns leave out; no context is fetched.
  // Fields left out of `briefConfig` take their defaults.
  getExcludedFiles: async (
    reviewId: string,
    briefConfig?: Partial<BriefConfig>
  ): Promise<ExcludedFiles> => {
    const res = await httpClient.post<unknown>(`/api/v1/reviews/${reviewId}/excluded-files`, {
      brief_config: briefConfig ?? null,
    });
    return ExcludedFilesSchema.parse(res.data);
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

  // Sends the kept comments that are not on the MR yet; each outcome is stored on its comment.
  // Answers 409 for a completed iteration (unless `force`) and while another post of it runs.
  post: async (reviewId: string, options: PostReviewOptions): Promise<PostReviewResult> => {
    const res = await httpClient.post<unknown>(
      `/api/v1/reviews/${reviewId}/post`,
      {
        iteration_id: options.iterationId,
        fallback_to_general_note: options.fallbackToGeneralNote,
        severity_label: options.severityLabel,
        force: options.force ?? false,
        resend_ambiguous: options.resendAmbiguous ?? false,
      },
      { timeout: POST_TIMEOUT_MS }
    );
    return PostReviewResultSchema.parse(res.data);
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
