import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildDispatchRequest,
  defaultMaxOutputTokens,
  defaultSettingsFor,
  loadProviderSettings,
  saveProviderSettings,
  SETTINGS_BY_PROVIDER_KEY,
} from "./dispatchSettings";

import type { AIProvider, ModelCapabilities } from "@entities/ai-provider";

const PROVIDER: AIProvider = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Claude",
  type: "claude",
  base_url: "",
  models: ["claude-opus-5-5", "claude-haiku-4-5"],
  ssl_verify: true,
  timeout: 60,
  created_at: "2026-05-16T10:00:00+00:00",
};

const CURRENT_CLAUDE: ModelCapabilities = {
  provider_type: "claude",
  model: "claude-opus-5-5",
  known_model: true,
  thinking: "always",
  reasoning_modes: ["effort"],
  effort_levels: ["low", "medium", "high", "xhigh", "max"],
  default_effort: "medium",
  min_reasoning_budget: null,
  temperature: false,
  max_temperature: 1,
  max_output_tokens: 128_000,
  default_max_output_tokens: 32_000,
  structured_output: true,
  structured_output_default: true,
};

const OPUS_4_6: ModelCapabilities = {
  ...CURRENT_CLAUDE,
  model: "claude-opus-4-6",
  thinking: "optional",
  effort_levels: ["low", "medium", "high", "max"],
  default_effort: "high",
  temperature: true,
};

const COMPAT: ModelCapabilities = {
  ...CURRENT_CLAUDE,
  provider_type: "openai_compat",
  model: "llama3",
  known_model: false,
  thinking: "optional",
  reasoning_modes: ["effort", "budget"],
  effort_levels: ["low", "medium", "high"],
  default_effort: null,
  min_reasoning_budget: 1024,
  temperature: true,
  max_temperature: 2,
  max_output_tokens: null,
  default_max_output_tokens: null,
  structured_output_default: false,
};

const settings = defaultSettingsFor(PROVIDER);

describe("buildDispatchRequest", () => {
  it("leaves everything to the defaults when nothing was chosen", () => {
    expect(buildDispatchRequest(PROVIDER.id, settings, CURRENT_CLAUDE, null)).toEqual({
      aiProviderId: PROVIDER.id,
      model: "claude-opus-5-5",
      temperature: null,
      reasoningEffort: null,
      reasoningBudget: null,
      maxOutputTokens: null,
      structuredOutput: null,
      systemPrompt: null,
      iterationId: null,
    });
  });

  it("drops the temperature a model does not take", () => {
    const request = buildDispatchRequest(
      PROVIDER.id,
      { ...settings, temperature: 0.4 },
      CURRENT_CLAUDE,
      null
    );

    expect(request.temperature).toBeNull();
  });

  it("drops the temperature while reasoning is on and caps it at the model's range", () => {
    const withTemperature = { ...settings, temperature: 1.6 };

    expect(buildDispatchRequest(PROVIDER.id, withTemperature, OPUS_4_6, null).temperature).toBe(1);
    expect(
      buildDispatchRequest(PROVIDER.id, { ...withTemperature, isReasoningOn: true }, OPUS_4_6, null)
    ).toMatchObject({ temperature: null, reasoningEffort: "high" });
  });

  it("moves an effort the model lacks to one it has", () => {
    const request = buildDispatchRequest(
      PROVIDER.id,
      { ...settings, isReasoningOn: true, reasoningEffort: "xhigh" },
      OPUS_4_6,
      null
    );

    expect(request.reasoningEffort).toBe("high");
  });

  it("sends the budget in budget mode and keeps it below the output limit", () => {
    const budget = { ...settings, isReasoningOn: true, reasoningMode: "budget" as const };

    expect(
      buildDispatchRequest(PROVIDER.id, { ...budget, reasoningBudget: 4096 }, COMPAT, null)
    ).toMatchObject({ reasoningBudget: 4096, reasoningEffort: null });
    expect(
      buildDispatchRequest(
        PROVIDER.id,
        { ...budget, reasoningBudget: 100_000 },
        { ...COMPAT, max_output_tokens: 32_000 },
        null
      ).reasoningBudget
    ).toBe(32_000 - 4096);
  });

  it("caps the output limit at the model's maximum", () => {
    const request = buildDispatchRequest(
      PROVIDER.id,
      { ...settings, maxOutputTokens: 500_000 },
      CURRENT_CLAUDE,
      null
    );

    expect(request.maxOutputTokens).toBe(128_000);
  });

  it("leaves structured output to the server where the model has none", () => {
    const off = { ...settings, structuredOutput: true };

    expect(buildDispatchRequest(PROVIDER.id, off, CURRENT_CLAUDE, null).structuredOutput).toBe(
      true
    );
    expect(
      buildDispatchRequest(PROVIDER.id, off, { ...CURRENT_CLAUDE, structured_output: false }, null)
        .structuredOutput
    ).toBeNull();
  });

  it("sends a blank system prompt as the built-in one", () => {
    expect(
      buildDispatchRequest(PROVIDER.id, { ...settings, systemPrompt: "  " }, undefined, null)
        .systemPrompt
    ).toBeNull();
  });
});

describe("defaultMaxOutputTokens", () => {
  it("is the model default, raised for deep effort and thinking budgets", () => {
    const deep = { ...settings, reasoningEffort: "max" as const };
    const budget = {
      ...settings,
      isReasoningOn: true,
      reasoningMode: "budget" as const,
      reasoningBudget: 40_000,
    };

    expect(defaultMaxOutputTokens(settings, CURRENT_CLAUDE)).toBe(32_000);
    expect(defaultMaxOutputTokens(deep, CURRENT_CLAUDE)).toBe(64_000);
    expect(defaultMaxOutputTokens(budget, { ...COMPAT, default_max_output_tokens: 32_000 })).toBe(
      56_000
    );
    expect(defaultMaxOutputTokens(settings, COMPAT)).toBeNull();
  });
});

describe("provider settings storage", () => {
  const items = new Map<string, string>();

  beforeEach(() => {
    items.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        items.set(key, value);
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips the settings of each provider", () => {
    saveProviderSettings(PROVIDER.id, { ...settings, model: "typed-model", temperature: 0.2 });
    saveProviderSettings("other", { ...settings, temperature: 0.9 });

    expect(loadProviderSettings(PROVIDER)).toMatchObject({
      model: "typed-model",
      temperature: 0.2,
    });
  });

  it("replaces malformed fields with defaults and keeps the valid ones", () => {
    items.set(
      SETTINGS_BY_PROVIDER_KEY,
      JSON.stringify({ [PROVIDER.id]: { temperature: "hot", maxOutputTokens: 9000, model: "" } })
    );

    expect(loadProviderSettings(PROVIDER)).toMatchObject({
      model: "claude-opus-5-5",
      temperature: null,
      maxOutputTokens: 9000,
    });
  });

  it("falls back to defaults on unreadable storage", () => {
    items.set(SETTINGS_BY_PROVIDER_KEY, "{not json");

    expect(loadProviderSettings(PROVIDER)).toEqual(defaultSettingsFor(PROVIDER));
  });
});
