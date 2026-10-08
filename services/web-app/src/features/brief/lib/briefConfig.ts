import { BriefConfigSchema } from "@entities/review";
import type { BriefConfig } from "@entities/review";

/** One entry per non-blank line, trimmed, first occurrence kept. */
export const parseLines = (text: string): string[] => {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line && !seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  return lines;
};

export const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);

/** Whether two briefs would build the same prompt; key order does not matter. */
export const isSameBrief = (a: BriefConfig, b: BriefConfig): boolean =>
  (Object.keys(a) as (keyof BriefConfig)[]).every(
    (key) => JSON.stringify(a[key]) === JSON.stringify(b[key])
  ) && Object.keys(a).length === Object.keys(b).length;

// Which saved preset is picked, and the repository-specific paths, stay with the review.
const NOT_STORED_IN_PRESETS = new Set<string>([
  "custom_preset_id",
  "context_files",
  "include_paths",
]);

/** The brief fields a preset saved from `config` stores and applies when picked. */
export const presetOverridesFrom = (config: BriefConfig): Record<string, unknown> =>
  Object.fromEntries(Object.entries(config).filter(([key]) => !NOT_STORED_IN_PRESETS.has(key)));

/** `config` with a saved preset picked: its stored fields applied over the current ones. */
export const applyPreset = (
  config: BriefConfig,
  presetId: string,
  overrides: Record<string, unknown>
): BriefConfig => {
  const merged = BriefConfigSchema.safeParse({
    ...config,
    ...overrides,
    custom_preset_id: presetId,
  });
  return merged.success ? merged.data : { ...config, custom_preset_id: presetId };
};
