import { z } from "zod";

import { ReasoningEffortSchema } from "@entities/ai-provider";
import type { AIProvider, ModelCapabilities, ReasoningEffort } from "@entities/ai-provider";
import type { DispatchRequest } from "@entities/review";
import { readStorageItem, writeStorageItem } from "@shared/lib";

export const LAST_PROVIDER_KEY = "mr-review:dispatch:last-provider";
/** One `ProviderDispatchSettings` per provider id, as JSON. */
export const SETTINGS_BY_PROVIDER_KEY = "mr-review:dispatch:settings";

export const DEFAULT_REASONING_BUDGET = 8192;
export const MIN_REASONING_BUDGET = 1024;
export const REASONING_BUDGET_STEP = 1024;
export const MAX_REASONING_BUDGET = 64_000;
export const MIN_OUTPUT_TOKENS = 256;
export const MAX_OUTPUT_TOKENS = 128_000;
const DEFAULT_EFFORT: ReasoningEffort = "medium";
// A thinking budget leaves at least this much of the output limit for the answer.
const ANSWER_ROOM_TOKENS = 4096;

/**
 * What the user last chose for a provider. `null` means "the default" throughout: the model's own
 * temperature and effort, a model-sized output limit, the provider type's structured-output
 * default. `isReasoningOn` only matters for models where reasoning is optional.
 */
const ProviderDispatchSettingsSchema = z.object({
  model: z.string().catch(""),
  temperature: z.number().min(0).max(2).nullable().catch(null),
  isReasoningOn: z.boolean().catch(false),
  reasoningMode: z.enum(["effort", "budget"]).catch("effort"),
  reasoningEffort: ReasoningEffortSchema.nullable().catch(null),
  reasoningBudget: z.number().int().positive().catch(DEFAULT_REASONING_BUDGET),
  maxOutputTokens: z.number().int().positive().nullable().catch(null),
  structuredOutput: z.boolean().nullable().catch(null),
  systemPrompt: z.string().catch(""),
});

export type ProviderDispatchSettings = z.infer<typeof ProviderDispatchSettingsSchema>;

export const defaultSettingsFor = (provider: AIProvider | undefined): ProviderDispatchSettings => ({
  model: provider?.models[0] ?? "",
  temperature: null,
  isReasoningOn: false,
  reasoningMode: "effort",
  reasoningEffort: null,
  reasoningBudget: DEFAULT_REASONING_BUDGET,
  maxOutputTokens: null,
  structuredOutput: null,
  systemPrompt: "",
});

const readAll = (): Record<string, unknown> => {
  const raw = readStorageItem(SETTINGS_BY_PROVIDER_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** The provider's saved settings, field by field: anything missing or malformed takes its default. */
export const loadProviderSettings = (
  provider: AIProvider | undefined
): ProviderDispatchSettings => {
  const defaults = defaultSettingsFor(provider);
  const saved = provider ? readAll()[provider.id] : undefined;
  if (!saved || typeof saved !== "object") return defaults;
  const parsed = ProviderDispatchSettingsSchema.safeParse({ ...defaults, ...saved });
  if (!parsed.success) return defaults;
  // A model saved for this provider stays even when it is not in its list: it was typed in.
  return { ...parsed.data, model: parsed.data.model || defaults.model };
};

export const saveProviderSettings = (
  providerId: string,
  settings: ProviderDispatchSettings
): void => {
  writeStorageItem(
    SETTINGS_BY_PROVIDER_KEY,
    JSON.stringify({ ...readAll(), [providerId]: settings })
  );
};

/** The provider of the last run while it still exists, else the first one. */
export const pickInitialProviderId = (providers: AIProvider[]): string => {
  const saved = readStorageItem(LAST_PROVIDER_KEY);
  if (saved && providers.some((p) => p.id === saved)) return saved;
  return providers[0]?.id ?? "";
};

export const saveLastProviderId = (providerId: string): void => {
  writeStorageItem(LAST_PROVIDER_KEY, providerId);
};

const nearestEffort = (
  wanted: ReasoningEffort | null,
  caps: ModelCapabilities
): ReasoningEffort | null => {
  if (wanted && caps.effort_levels.includes(wanted)) return wanted;
  const fallback = caps.default_effort ?? DEFAULT_EFFORT;
  return caps.effort_levels.includes(fallback) ? fallback : (caps.effort_levels[0] ?? null);
};

/** The reasoning mode the controls show: the chosen one when the model offers it, else its first. */
export const activeReasoningMode = (
  settings: ProviderDispatchSettings,
  caps: ModelCapabilities | undefined
): "effort" | "budget" | null => {
  if (!caps) return settings.reasoningMode;
  if (caps.reasoning_modes.includes(settings.reasoningMode)) return settings.reasoningMode;
  return caps.reasoning_modes[0] ?? null;
};

/** Whether this dispatch reasons: always on some models, never on others, else the user's toggle. */
export const isReasoningActive = (
  settings: ProviderDispatchSettings,
  caps: ModelCapabilities | undefined
): boolean => {
  if (caps?.thinking === "always") return true;
  if (caps?.thinking === "none") return false;
  return settings.isReasoningOn;
};

/** The highest thinking budget that still leaves the answer room under the model's output cap. */
export const maxReasoningBudget = (caps: ModelCapabilities | undefined): number =>
  Math.max(
    MIN_REASONING_BUDGET,
    Math.min(
      MAX_REASONING_BUDGET,
      (caps?.max_output_tokens ?? MAX_OUTPUT_TOKENS) - ANSWER_ROOM_TOKENS
    )
  );

type ReasoningRequest = Pick<DispatchRequest, "reasoningEffort" | "reasoningBudget">;

const reasoningRequest = (
  settings: ProviderDispatchSettings,
  caps: ModelCapabilities | undefined
): ReasoningRequest => {
  if (!isReasoningActive(settings, caps)) return {};
  const mode = activeReasoningMode(settings, caps);
  if (mode === "budget") {
    return { reasoningBudget: Math.min(settings.reasoningBudget, maxReasoningBudget(caps)) };
  }
  if (mode !== "effort") return {};
  if (!caps) return { reasoningEffort: settings.reasoningEffort ?? DEFAULT_EFFORT };
  // Where reasoning is always on, "no effort" means the model's own default.
  if (caps.thinking === "always" && settings.reasoningEffort === null) return {};
  return { reasoningEffort: nearestEffort(settings.reasoningEffort, caps) };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

// Mirrors the server: deeper effort and thinking budgets get a larger output limit by default.
const DEEP_EFFORT_OUTPUT_TOKENS = 64_000;
const DEFAULT_ANSWER_TOKENS = 16_000;

/** The output limit the server picks when none is set; `null` when the endpoint decides. */
export const defaultMaxOutputTokens = (
  settings: ProviderDispatchSettings,
  caps: ModelCapabilities | undefined
): number | null => {
  const base = caps?.default_max_output_tokens;
  if (base == null) return null;
  const reasoning = reasoningRequest(settings, caps);
  let wanted = base;
  if (reasoning.reasoningEffort === "xhigh" || reasoning.reasoningEffort === "max") {
    wanted = Math.max(wanted, DEEP_EFFORT_OUTPUT_TOKENS);
  }
  if (reasoning.reasoningBudget != null) {
    wanted = Math.max(wanted, reasoning.reasoningBudget + DEFAULT_ANSWER_TOKENS);
  }
  return Math.min(wanted, caps?.max_output_tokens ?? wanted);
};

/**
 * The dispatch request for these settings, holding only what the model accepts: temperature only
 * where supported and while reasoning is off, effort or budget per the model's reasoning mode, the
 * output limit within the model's cap. Without capabilities (still loading, or unavailable) the
 * settings go as they are and the server adapts them.
 */
export const buildDispatchRequest = (
  providerId: string,
  settings: ProviderDispatchSettings,
  caps: ModelCapabilities | undefined,
  iterationId: string | null
): DispatchRequest => {
  const reasoning = reasoningRequest(settings, caps);
  const isReasoning = reasoning.reasoningEffort != null || reasoning.reasoningBudget != null;
  const acceptsTemperature = caps?.temperature ?? true;
  const temperature =
    settings.temperature === null || isReasoning || !acceptsTemperature
      ? null
      : clamp(settings.temperature, 0, caps?.max_temperature ?? 2);
  const maxOutput =
    settings.maxOutputTokens === null
      ? null
      : clamp(
          settings.maxOutputTokens,
          MIN_OUTPUT_TOKENS,
          caps?.max_output_tokens ?? MAX_OUTPUT_TOKENS
        );
  return {
    aiProviderId: providerId,
    model: settings.model.trim() || null,
    temperature,
    reasoningEffort: reasoning.reasoningEffort ?? null,
    reasoningBudget: reasoning.reasoningBudget ?? null,
    maxOutputTokens: maxOutput,
    structuredOutput: caps && !caps.structured_output ? null : settings.structuredOutput,
    systemPrompt: settings.systemPrompt.trim() ? settings.systemPrompt : null,
    iterationId,
  };
};
