import { z } from "zod";

export const AIProviderTypeSchema = z.enum(["claude", "openai", "openai_compat"]);

export const AIProviderSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: AIProviderTypeSchema,
  base_url: z.string(),
  models: z.array(z.string()),
  ssl_verify: z.boolean(),
  timeout: z.number().int().positive(),
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

export type AIProviderType = z.infer<typeof AIProviderTypeSchema>;
export type AIProvider = z.infer<typeof AIProviderSchema>;
export type CreateAIProvider = z.infer<typeof CreateAIProviderSchema>;
export type UpdateAIProvider = z.infer<typeof UpdateAIProviderSchema>;
