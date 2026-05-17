import { z } from "zod";

export const PatchStatusSchema = z.enum(["pending", "applied", "posted", "discarded"]);

export const PatchStatsSchema = z.object({
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});

export const SuggestedPatchSchema = z.object({
  unified_diff: z.string().min(1),
  file_path: z.string(),
  anchor_lines: z
    .tuple([z.number().int().positive(), z.number().int().positive()])
    .refine(([start, end]) => end >= start, {
      message: "anchor_lines: end must be >= start",
    }),
  base_sha: z.string().min(7).nullable(),
  is_stale: z.boolean(),
  stats: PatchStatsSchema,
});

export const AppliedPatchSchema = z.object({
  comment_id: z.string().uuid(),
  before_sha: z.string(),
  after_sha: z.string(),
  applied_at: z.string().datetime({ offset: true }),
});

export const PatchErrorCodeSchema = z.enum([
  "PATCH_NOT_FOUND",
  "PATCH_STALE",
  "PATCH_ALREADY_APPLIED",
  "PATCH_ALREADY_POSTED",
  "PATCH_INVALID_DIFF",
  "PATCH_NO_BEFORE_SHA",
  "PATCH_REVERT_SHA_MISMATCH",
  "VCS_ERROR",
]);

export const PatchErrorEnvelopeSchema = z.object({
  code: PatchErrorCodeSchema,
  message: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export type PatchStatus = z.infer<typeof PatchStatusSchema>;
export type PatchStats = z.infer<typeof PatchStatsSchema>;
export type SuggestedPatch = z.infer<typeof SuggestedPatchSchema>;
export type AppliedPatch = z.infer<typeof AppliedPatchSchema>;
export type PatchErrorCode = z.infer<typeof PatchErrorCodeSchema>;
export type PatchErrorEnvelope = z.infer<typeof PatchErrorEnvelopeSchema>;
