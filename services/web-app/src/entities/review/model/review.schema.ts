import { z } from "zod";
import { PatchStatusSchema, SuggestedPatchSchema } from "./patch.schema";

export const BriefPresetSchema = z.enum(["thorough", "security", "style", "performance"]);

export const SeveritySchema = z.enum(["critical", "major", "minor", "suggestion"]);

// Sized for a ~200k-token model at ~4 characters per token; the server caps it to this range.
export const DEFAULT_PROMPT_BUDGET_CHARS = 600_000;
export const MIN_PROMPT_BUDGET_CHARS = 20_000;
export const MAX_PROMPT_BUDGET_CHARS = 4_000_000;
export const MAX_COMMENTS_LIMIT = 200;

// Fields added after the first release default here, so briefs stored or cached by older
// versions still parse.
export const BriefConfigSchema = z.object({
  preset: BriefPresetSchema,
  custom_preset_id: z.string().uuid().nullable().default(null),
  include_diff: z.boolean(),
  include_description: z.boolean(),
  include_context: z.boolean().default(true),
  include_full_files: z.boolean(),
  include_test_context: z.boolean(),
  include_related_code: z.boolean(),
  include_commit_history: z.boolean(),
  custom_instructions: z.string(),
  context_files: z.array(z.string()).default([]),
  focus_areas: z.array(z.string()).default([]),
  output_language: z.string().default(""),
  min_severity: SeveritySchema.default("suggestion"),
  max_comments: z.number().int().positive().nullable().default(null),
  include_paths: z.array(z.string()).default([]),
  exclude_paths: z.array(z.string()).default([]),
  use_default_excludes: z.boolean().default(true),
  annotate_line_numbers: z.boolean().default(true),
  include_previous_comments: z.boolean().default(true),
  prompt_budget_chars: z.number().int().positive().default(DEFAULT_PROMPT_BUDGET_CHARS),
});

export const CommentStatusSchema = z.enum(["kept", "dismissed"]);

// inline: anchored to its line; general_note: an MR-level note (no line, or the line could not be
// anchored); failed: the host refused it or could not be reached.
export const PostOutcomeSchema = z.enum(["inline", "general_note", "failed"]);

export const PostFailureKindSchema = z.enum([
  "position_rejected",
  "rejected",
  "ambiguous",
  "blocked",
]);

/** What happened the last time a comment was sent to the MR. */
export const CommentPostSchema = z.object({
  outcome: PostOutcomeSchema,
  // When it was posted, or when the attempt failed.
  at: z.string().datetime({ offset: true }),
  note_id: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  // failed: the host's error; general_note: why a comment with a line did not go inline.
  reason: z.string().nullable().default(null),
  // failed only. position_rejected / rejected: nothing was posted. ambiguous: the host gave no
  // definitive answer, so it may be on the MR already. blocked: not sent on purpose (a pending
  // review of the user's in Gitea).
  failure_kind: PostFailureKindSchema.nullable().default(null),
});

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
  // Set by Post; absent until the comment was first sent (optional, so comments built in the app
  // before posting need not spell it out).
  post: CommentPostSchema.nullish(),
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

export const MRReviewSourceSchema = z.object({
  kind: z.literal("mr"),
  mr_iid: z.number(),
});

/** A review of the diff between two refs; it has no merge request (`mr_iid` is 0). */
export const BranchDiffReviewSourceSchema = z.object({
  kind: z.literal("branch_diff"),
  base_ref: z.string(),
  head_ref: z.string(),
  title: z.string().default(""),
});

export const ReviewSourceSchema = z.discriminatedUnion("kind", [
  MRReviewSourceSchema,
  BranchDiffReviewSourceSchema,
]);

export const ReviewSchema = z.object({
  id: z.string().uuid(),
  host_id: z.string().uuid(),
  repo_path: z.string(),
  mr_iid: z.number(),
  // Older servers did not send it: those reviews are all merge request reviews.
  source: ReviewSourceSchema.optional(),
  iterations: z.array(IterationSchema),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type BriefPreset = z.infer<typeof BriefPresetSchema>;
export type BriefConfig = z.infer<typeof BriefConfigSchema>;
export type CommentSeverity = z.infer<typeof SeveritySchema>;
export type CommentStatus = z.infer<typeof CommentStatusSchema>;
export type PostOutcome = z.infer<typeof PostOutcomeSchema>;
export type PostFailureKind = z.infer<typeof PostFailureKindSchema>;
export type CommentPost = z.infer<typeof CommentPostSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type IterationStage = z.infer<typeof IterationStageSchema>;
export type Iteration = z.infer<typeof IterationSchema>;
export type ReviewSource = z.infer<typeof ReviewSourceSchema>;
export type Review = z.infer<typeof ReviewSchema>;

// Virtual stage that includes "pick" (no iteration yet) + all iteration stages
export type ReviewStage = "pick" | IterationStage;

export const DEFAULT_BRIEF_CONFIG: BriefConfig = {
  preset: "thorough",
  custom_preset_id: null,
  include_diff: true,
  include_description: true,
  include_context: true,
  include_full_files: false,
  include_test_context: false,
  include_related_code: false,
  include_commit_history: false,
  custom_instructions: "",
  context_files: [],
  focus_areas: [],
  output_language: "",
  min_severity: "suggestion",
  max_comments: null,
  include_paths: [],
  exclude_paths: [],
  use_default_excludes: true,
  annotate_line_numbers: true,
  include_previous_comments: true,
  prompt_budget_chars: DEFAULT_PROMPT_BUDGET_CHARS,
};

export const getReviewBriefConfig = (review: Review): BriefConfig => {
  const last = review.iterations[review.iterations.length - 1];
  if (!last) return DEFAULT_BRIEF_CONFIG;
  // A review restored from the persisted query cache may predate newer brief fields.
  const parsed = BriefConfigSchema.safeParse(last.brief_config);
  return parsed.success ? parsed.data : { ...DEFAULT_BRIEF_CONFIG, ...last.brief_config };
};

export const getReviewSource = (review: Review): ReviewSource =>
  review.source ?? { kind: "mr", mr_iid: review.mr_iid };

/** The merge request a review belongs to; null for a branch diff review. */
export const getReviewMRIid = (review: Review): number | null => {
  const source = getReviewSource(review);
  return source.kind === "mr" ? source.mr_iid : null;
};

/**
 * An iteration that reached Post: all of its comments are on the merge request
 * (`completed_at` is set), or some are (`stage` is "post"). Either way it stays as it was
 * posted — the server refuses a new brief for it — so the next round is a new iteration.
 * The server's `reached_post`.
 */
export const isIterationPosted = (iteration: Iteration): boolean =>
  iteration.completed_at !== null || iteration.stage === "post";
