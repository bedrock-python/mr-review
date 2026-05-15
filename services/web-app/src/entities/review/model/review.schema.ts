import { z } from "zod";

export const BriefPresetSchema = z.enum(["thorough", "security", "style", "performance"]);

export const BriefConfigSchema = z.object({
  preset: BriefPresetSchema,
  include_diff: z.boolean(),
  include_description: z.boolean(),
  include_full_files: z.boolean(),
  include_test_context: z.boolean(),
  include_related_code: z.boolean(),
  include_commit_history: z.boolean(),
  custom_instructions: z.string(),
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
});

export const ReviewStageSchema = z.enum(["pick", "brief", "dispatch", "polish", "post"]);

export const ReviewSchema = z.object({
  id: z.string().uuid(),
  host_id: z.string().uuid(),
  repo_path: z.string(),
  mr_iid: z.number(),
  stage: ReviewStageSchema,
  comments: z.array(CommentSchema),
  brief_config: BriefConfigSchema,
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type BriefPreset = z.infer<typeof BriefPresetSchema>;
export type BriefConfig = z.infer<typeof BriefConfigSchema>;
export type CommentSeverity = z.infer<typeof SeveritySchema>;
export type CommentStatus = z.infer<typeof CommentStatusSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type ReviewStage = z.infer<typeof ReviewStageSchema>;
export type Review = z.infer<typeof ReviewSchema>;
