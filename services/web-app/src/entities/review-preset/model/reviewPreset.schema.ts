import { z } from "zod";

export const MAX_PRESET_NAME_CHARS = 80;
export const MAX_PRESET_DESCRIPTION_CHARS = 500;
export const MAX_PRESET_INSTRUCTIONS_CHARS = 20_000;

/** One of the four built-in review intents and the instructions it puts in the prompt. */
export const BuiltinPresetSchema = z.object({
  id: z.enum(["thorough", "security", "style", "performance"]),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
});

/**
 * A review intent saved by the user. `instructions` replace the built-in preset's text in the
 * prompt (empty keeps it); `brief_config` holds brief fields applied when the preset is picked.
 */
export const ReviewPresetSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().default(""),
  instructions: z.string().default(""),
  brief_config: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const ReviewPresetFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(MAX_PRESET_NAME_CHARS, `At most ${String(MAX_PRESET_NAME_CHARS)} characters`),
  description: z
    .string()
    .max(
      MAX_PRESET_DESCRIPTION_CHARS,
      `At most ${String(MAX_PRESET_DESCRIPTION_CHARS)} characters`
    ),
  instructions: z
    .string()
    .max(
      MAX_PRESET_INSTRUCTIONS_CHARS,
      `At most ${String(MAX_PRESET_INSTRUCTIONS_CHARS)} characters`
    ),
});

export type BuiltinPreset = z.infer<typeof BuiltinPresetSchema>;
export type ReviewPreset = z.infer<typeof ReviewPresetSchema>;
export type ReviewPresetForm = z.infer<typeof ReviewPresetFormSchema>;

export type CreateReviewPresetInput = ReviewPresetForm & {
  brief_config?: Record<string, unknown>;
};

/** Omitted fields keep their value; `brief_config` replaces the stored fields as a whole. */
export type UpdateReviewPresetInput = Partial<CreateReviewPresetInput>;
