import { z } from "zod";
import { PatchStatusSchema, SuggestedPatchSchema } from "./patch.schema";

export const BriefPresetSchema = z.enum(["thorough", "security", "style", "performance"]);

export const BriefConfigSchema = z.object({
  preset: BriefPresetSchema,
  include_diff: z.boolean(),
  include_description: z.boolean(),
  include_context: z.boolean().default(true),
  include_full_files: z.boolean(),
  include_test_context: z.boolean(),
  include_related_code: z.boolean(),
  include_commit_history: z.boolean(),
  custom_instructions: z.string(),
  context_files: z.array(z.string()).default([]),
});

export const SeveritySchema = z.enum(["critical", "major", "minor", "suggestion"]);

export const CommentStatusSchema = z.enum(["kept", "dismissed"]);

export const CommentSchema = z.object({
  id: z.string().uuid(),
  file: z.string().nullable(),
  line: z.number().nullable(),
  severity: SeveritySchema,
  body: z.string(),
  status: CommentStatusSchema,
  resolved: z.boolean().default(false),
  // Inline Fix Suggestions (C1). All fields are optional/nullable so
  // backward-compat with existing YAML/responses is preserved.
  suggested_patch: SuggestedPatchSchema.nullable().default(null),
  patch_status: PatchStatusSchema.default("pending"),
  patch_ref_url: z.string().url().nullable().default(null),
  patch_applied_at: z.string().datetime({ offset: true }).nullable().default(null),
});

export const IterationStageSchema = z.enum(["brief", "dispatch", "polish", "post"]);

export const IterationSchema = z.object({
  id: z.string().uuid(),
  number: z.number(),
  stage: IterationStageSchema,
  comments: z.array(CommentSchema),
  ai_provider_id: z.string().uuid().nullable(),
  model: z.string().nullable(),
  brief_config: BriefConfigSchema,
  created_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }).nullable(),
});

export const ReviewSchema = z.object({
  id: z.string().uuid(),
  host_id: z.string().uuid(),
  repo_path: z.string(),
  mr_iid: z.number(),
  iterations: z.array(IterationSchema),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type BriefPreset = z.infer<typeof BriefPresetSchema>;
export type BriefConfig = z.infer<typeof BriefConfigSchema>;
export type CommentSeverity = z.infer<typeof SeveritySchema>;
export type CommentStatus = z.infer<typeof CommentStatusSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type IterationStage = z.infer<typeof IterationStageSchema>;
export type Iteration = z.infer<typeof IterationSchema>;
export type Review = z.infer<typeof ReviewSchema>;

// Virtual stage that includes "pick" (no iteration yet) + all iteration stages
export type ReviewStage = "pick" | IterationStage;

export const DEFAULT_BRIEF_CONFIG: BriefConfig = {
  preset: "thorough",
  include_diff: true,
  include_description: true,
  include_context: true,
  include_full_files: false,
  include_test_context: false,
  include_related_code: false,
  include_commit_history: false,
  custom_instructions: "",
  context_files: [],
};

export const getReviewBriefConfig = (review: Review): BriefConfig => {
  const last = review.iterations[review.iterations.length - 1];
  return last?.brief_config ?? DEFAULT_BRIEF_CONFIG;
};
