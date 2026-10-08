import { z } from "zod";

export const AIProviderTypeSchema = z.enum(["claude", "openai", "openai_compat"]);

// What the server stores; a provider saved before the server checked its timeout is still
// listed, so it can be fixed. Input is validated by the create/update schemas below.
export const AIProviderSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: AIProviderTypeSchema,
  base_url: z.string(),
  models: z.array(z.string()),
  ssl_verify: z.boolean(),
  timeout: z.number().int(),
  created_at: z.string().datetime({ offset: true }),
});

export const CreateAIProviderSchema = z.object({
  name: z.string().min(1, "Name required"),
  type: AIProviderTypeSchema,
  api_key: z.string().min(1, "API key required"),
  base_url: z.string().default(""),
  models: z.array(z.string()).default([]),
  ssl_verify: z.boolean().default(true),
  timeout: z.number().int().min(1, "Must be ≥ 1").max(600, "Must be ≤ 600").default(60),
});

export const UpdateAIProviderSchema = z.object({
  name: z.string().min(1, "Name required").optional(),
  api_key: z.union([z.string().min(1, "API key required"), z.literal("")]).optional(),
  base_url: z.string().optional(),
  models: z.array(z.string()).optional(),
  ssl_verify: z.boolean().optional(),
  timeout: z.number().int().min(1).max(600).optional(),
});

/** Every reasoning level a backend knows, weakest first; a model accepts a subset. */
export const REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export const ReasoningEffortSchema = z.enum(REASONING_EFFORTS);
export const ReasoningModeSchema = z.enum(["effort", "budget"]);

/**
 * `GET /ai-providers/{id}/capabilities` — which dispatch settings a model accepts.
 * `thinking`: `always` — reasoning cannot be turned off, only tuned; `optional` — off unless
 * asked for; `none` — the model does not reason. Temperature is only ever sent while reasoning
 * is off.
 */
export const ModelCapabilitiesSchema = z.object({
  provider_type: AIProviderTypeSchema,
  model: z.string(),
  known_model: z.boolean(),
  thinking: z.enum(["always", "optional", "none"]),
  reasoning_modes: z.array(ReasoningModeSchema),
  effort_levels: z.array(ReasoningEffortSchema),
  default_effort: ReasoningEffortSchema.nullable(),
  min_reasoning_budget: z.number().int().nullable(),
  temperature: z.boolean(),
  max_temperature: z.number(),
  max_output_tokens: z.number().int().nullable(),
  default_max_output_tokens: z.number().int().nullable(),
  structured_output: z.boolean(),
  structured_output_default: z.boolean(),
});

/**
 * `POST /ai-providers/preview/models` — connection settings that may not be saved yet. With
 * `provider_id` the saved provider fills in what is left out; a blank `api_key` keeps the saved key.
 */
export type PreviewModelsRequest = {
  provider_id?: string;
  type?: AIProviderType;
  api_key?: string;
  base_url?: string;
  ssl_verify?: boolean;
  timeout?: number;
};

export type AIProviderType = z.infer<typeof AIProviderTypeSchema>;
export type AIProvider = z.infer<typeof AIProviderSchema>;
export type CreateAIProvider = z.infer<typeof CreateAIProviderSchema>;
export type UpdateAIProvider = z.infer<typeof UpdateAIProviderSchema>;
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;
export type ReasoningMode = z.infer<typeof ReasoningModeSchema>;
export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;
