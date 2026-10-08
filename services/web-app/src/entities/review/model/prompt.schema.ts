import { z } from "zod";

/** A changed file the brief's path filters leave out of the review. */
export const ExcludedFileSchema = z.object({
  path: z.string(),
  /** The exclude pattern that matched, or "(not matched by the include patterns)". */
  reason: z.string(),
});

/** One part of the prompt: how much of it went in and what the size budget cut or left out. */
export const PromptSectionSchema = z.object({
  key: z.string(),
  label: z.string(),
  chars: z.number().int().nonnegative(),
  source_chars: z.number().int().nonnegative(),
  items: z.number().int().nonnegative(),
  included: z.number().int().nonnegative(),
  truncated: z.array(z.string()).default([]),
  omitted: z.array(z.string()).default([]),
  /** Files skipped because their content looks binary. */
  skipped: z.array(z.string()).default([]),
});

/** `POST /reviews/{id}/prompt/preview` — the prompt and a breakdown of its size. */
export const PromptPreviewSchema = z.object({
  prompt: z.string(),
  total_chars: z.number().int().nonnegative(),
  /** About four characters per token: a rough guide, not a tokenizer count. */
  estimated_tokens: z.number().int().nonnegative(),
  budget_chars: z.number().int().positive(),
  sections: z.array(PromptSectionSchema),
  files_total: z.number().int().nonnegative(),
  excluded_files: z.array(ExcludedFileSchema),
  preset_name: z.string().nullable().default(null),
  preset_missing: z.boolean().default(false),
});

/** `POST /reviews/{id}/excluded-files` */
export const ExcludedFilesSchema = z.object({
  total: z.number().int().nonnegative(),
  excluded: z.array(ExcludedFileSchema),
});

export type ExcludedFile = z.infer<typeof ExcludedFileSchema>;
export type PromptSection = z.infer<typeof PromptSectionSchema>;
export type PromptPreview = z.infer<typeof PromptPreviewSchema>;
export type ExcludedFiles = z.infer<typeof ExcludedFilesSchema>;
