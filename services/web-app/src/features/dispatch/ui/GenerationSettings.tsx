import { useState } from "react";

import type { ModelCapabilities, ReasoningEffort } from "@entities/ai-provider";

import {
  activeReasoningMode,
  defaultMaxOutputTokens,
  isReasoningActive,
  maxReasoningBudget,
  MAX_OUTPUT_TOKENS,
  MIN_OUTPUT_TOKENS,
  MIN_REASONING_BUDGET,
  REASONING_BUDGET_STEP,
} from "../model/dispatchSettings";
import type { ProviderDispatchSettings } from "../model/dispatchSettings";

const REASONING_COLOR = "var(--c-critical)";
const FALLBACK_EFFORTS: ReasoningEffort[] = ["low", "medium", "high"];
const TEMPERATURE_STEP = 0.05;

export type GenerationSettingsProps = {
  settings: ProviderDispatchSettings;
  /** What the selected model accepts; while unknown every control is offered. */
  capabilities: ModelCapabilities | undefined;
  onChange: (patch: Partial<ProviderDispatchSettings>) => void;
  accentColor: string;
  isDisabled: boolean;
};

const chipCss = (isActive: boolean, color: string): React.CSSProperties => ({
  fontSize: 11,
  padding: "4px 10px",
  borderRadius: 6,
  border: `1px solid ${isActive ? color : "var(--border)"}`,
  background: isActive ? `color-mix(in oklch, ${color} 10%, var(--bg-0))` : "var(--bg-2)",
  color: isActive ? color : "var(--fg-2)",
  cursor: "pointer",
  fontWeight: isActive ? 600 : 400,
});

const labelCss: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: "var(--fg-1)" };
const hintCss: React.CSSProperties = { fontSize: 11, color: "var(--fg-2)" };

const formatTokens = (tokens: number): string => tokens.toLocaleString("en-US");

/* ── Reasoning ─────────────────────────────────────────────── */
const ReasoningControls = ({
  settings,
  capabilities: caps,
  onChange,
  isDisabled,
}: Omit<GenerationSettingsProps, "accentColor">): React.ReactElement | null => {
  if (caps?.thinking === "none") {
    return <span style={hintCss}>Reasoning: this model does not reason.</span>;
  }
  const isAlways = caps?.thinking === "always";
  const isOn = isReasoningActive(settings, caps);
  const modes = caps?.reasoning_modes ?? ["effort", "budget"];
  const mode = activeReasoningMode(settings, caps);
  const levels = caps?.effort_levels ?? FALLBACK_EFFORTS;
  const defaultLabel = caps?.default_effort ? `Default (${caps.default_effort})` : "Default";
  const budgetMax = maxReasoningBudget(caps);
  const budgetMin = caps?.min_reasoning_budget ?? MIN_REASONING_BUDGET;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={labelCss}>Reasoning</span>
        {isAlways ? (
          <span style={hintCss}>Always on for this model — tune the effort</span>
        ) : (
          <button
            type="button"
            aria-label="Reasoning"
            aria-pressed={isOn}
            disabled={isDisabled}
            onClick={() => {
              onChange({ isReasoningOn: !settings.isReasoningOn });
            }}
            style={{ ...chipCss(isOn, REASONING_COLOR), borderRadius: 999 }}
          >
            {isOn ? "On" : "Off"}
          </button>
        )}
      </div>

      {isOn && modes.length > 1 && (
        <div style={{ display: "flex", gap: 4 }} role="group" aria-label="Reasoning mode">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={isDisabled}
              onClick={() => {
                onChange({ reasoningMode: m });
              }}
              style={{ ...chipCss(mode === m, REASONING_COLOR), textTransform: "capitalize" }}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {isOn && mode === "effort" && (
        <div
          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
          role="group"
          aria-label="Reasoning effort"
        >
          {isAlways && (
            <button
              type="button"
              aria-pressed={settings.reasoningEffort === null}
              disabled={isDisabled}
              onClick={() => {
                onChange({ reasoningEffort: null });
              }}
              style={chipCss(settings.reasoningEffort === null, REASONING_COLOR)}
            >
              {defaultLabel}
            </button>
          )}
          {levels.map((level) => {
            const isActive =
              settings.reasoningEffort === level ||
              (!isAlways &&
                settings.reasoningEffort === null &&
                level === (caps?.default_effort ?? "medium"));
            return (
              <button
                key={level}
                type="button"
                aria-pressed={isActive}
                disabled={isDisabled}
                onClick={() => {
                  onChange({ reasoningEffort: level });
                }}
                style={chipCss(isActive, REASONING_COLOR)}
              >
                {level}
              </button>
            );
          })}
        </div>
      )}

      {isOn && mode === "budget" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="range"
            aria-label="Thinking budget"
            min={budgetMin}
            max={budgetMax}
            step={REASONING_BUDGET_STEP}
            value={Math.min(Math.max(settings.reasoningBudget, budgetMin), budgetMax)}
            disabled={isDisabled}
            onChange={(e) => {
              onChange({ reasoningBudget: parseInt(e.target.value, 10) });
            }}
            style={{ flex: 1, accentColor: REASONING_COLOR, height: 4 }}
          />
          <span className="mono" style={{ fontSize: 12, color: "var(--fg-1)", flexShrink: 0 }}>
            {formatTokens(Math.min(settings.reasoningBudget, budgetMax))} tok
          </span>
        </div>
      )}
    </div>
  );
};

/* ── Temperature ───────────────────────────────────────────── */
const TemperatureControl = ({
  settings,
  capabilities: caps,
  onChange,
  accentColor,
  isDisabled,
}: GenerationSettingsProps): React.ReactElement => {
  if (caps && !caps.temperature) {
    return <span style={hintCss}>Temperature: not accepted by this model — it uses its own.</span>;
  }
  const max = caps?.max_temperature ?? 2;
  const isReasoning = isReasoningActive(settings, caps);
  const isUnset = settings.temperature === null;

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 8, opacity: isReasoning ? 0.55 : 1 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={labelCss}>Temperature</span>
          <span style={{ ...hintCss, marginLeft: 8 }}>
            {isReasoning ? "Not sent while reasoning is on" : "Controls randomness of output"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            className="mono"
            data-testid="temperature-value"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: isUnset ? "var(--fg-2)" : "var(--fg-0)",
            }}
          >
            {isUnset ? "Default" : settings.temperature}
          </span>
          {!isUnset && (
            <button
              type="button"
              onClick={() => {
                onChange({ temperature: null });
              }}
              style={{ ...chipCss(false, accentColor), padding: "2px 6px", fontSize: 10 }}
              title="Use the model's default temperature"
            >
              reset
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        aria-label="Temperature"
        min="0"
        max={max}
        step={TEMPERATURE_STEP}
        value={settings.temperature ?? max / 2}
        disabled={isDisabled || isReasoning}
        onChange={(e) => {
          onChange({ temperature: parseFloat(e.target.value) });
        }}
        style={{ width: "100%", accentColor, height: 4, opacity: isUnset ? 0.4 : 1 }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--fg-2)",
        }}
      >
        <span>0 — Deterministic</span>
        <span>Unset — the model's default</span>
        <span>{max} — Creative</span>
      </div>
    </div>
  );
};

/* ── Advanced ──────────────────────────────────────────────── */
const AdvancedSettings = ({
  settings,
  capabilities: caps,
  onChange,
  isDisabled,
}: Omit<GenerationSettingsProps, "accentColor">): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const cap = caps?.max_output_tokens ?? MAX_OUTPUT_TOKENS;
  const defaultOutput = defaultMaxOutputTokens(settings, caps);
  const outputPlaceholder = defaultOutput
    ? `Default (${formatTokens(defaultOutput)})`
    : "Default (the endpoint's)";
  const supportsStructured = caps?.structured_output ?? true;
  const structuredDefault = caps?.structured_output_default ?? false;
  const isStructured = supportsStructured && (settings.structuredOutput ?? structuredDefault);
  const changed = [
    settings.maxOutputTokens !== null,
    settings.structuredOutput !== null,
    settings.systemPrompt.trim() !== "",
  ].filter(Boolean).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((open) => !open);
        }}
        style={{
          ...labelCss,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {isOpen ? "▾" : "▸"} Advanced
        {changed > 0 && <span style={{ ...hintCss, marginLeft: 8 }}>{changed} changed</span>}
      </button>

      {isOpen && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="dispatch-max-output-tokens" style={labelCss}>
              Max output tokens
            </label>
            <input
              id="dispatch-max-output-tokens"
              type="number"
              min={MIN_OUTPUT_TOKENS}
              max={cap}
              step={1000}
              placeholder={outputPlaceholder}
              value={settings.maxOutputTokens ?? ""}
              disabled={isDisabled}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                onChange({ maxOutputTokens: Number.isFinite(parsed) ? parsed : null });
              }}
              className="mono"
              style={{
                fontSize: 12,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-0)",
                color: "var(--fg-0)",
              }}
            />
            <span style={hintCss}>
              Model maximum{" "}
              {caps?.max_output_tokens ? formatTokens(caps.max_output_tokens) : "unknown"};
              reasoning counts toward the limit. Empty uses the default.
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isStructured}
                disabled={isDisabled || !supportsStructured}
                onChange={(e) => {
                  onChange({ structuredOutput: e.target.checked });
                }}
                style={{ accentColor: "var(--accent)" }}
              />
              <span style={labelCss}>Structured output</span>
            </label>
            {settings.structuredOutput !== null && supportsStructured && (
              <button
                type="button"
                onClick={() => {
                  onChange({ structuredOutput: null });
                }}
                style={{
                  ...chipCss(false, "var(--accent)"),
                  padding: "1px 6px",
                  fontSize: 10,
                  alignSelf: "flex-start",
                }}
              >
                use the provider default
              </button>
            )}
            <span style={hintCss}>
              {supportsStructured
                ? `Constrains the answer to the review JSON schema. Default for this provider: ${structuredDefault ? "on" : "off"}. Turn it off if the endpoint rejects it.`
                : "Not supported by this model."}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="dispatch-system-prompt" style={labelCss}>
              System prompt
            </label>
            <textarea
              id="dispatch-system-prompt"
              rows={4}
              value={settings.systemPrompt}
              disabled={isDisabled}
              placeholder="Empty: the built-in reviewer prompt"
              onChange={(e) => {
                onChange({ systemPrompt: e.target.value });
              }}
              style={{
                fontSize: 12,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-0)",
                color: "var(--fg-0)",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <span style={hintCss}>
              Replaces the built-in system prompt for runs with this provider.
            </span>
          </div>
        </>
      )}
    </div>
  );
};

/** Reasoning, temperature and the advanced settings — each offered only as far as the model accepts it. */
export const GenerationSettings = ({
  settings,
  capabilities,
  onChange,
  accentColor,
  isDisabled,
}: GenerationSettingsProps): React.ReactElement => (
  <div
    style={{
      borderRadius: 10,
      border: "1px solid var(--border)",
      background: "var(--bg-1)",
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 18,
    }}
  >
    <ReasoningControls
      settings={settings}
      capabilities={capabilities}
      onChange={onChange}
      isDisabled={isDisabled}
    />
    <TemperatureControl
      settings={settings}
      capabilities={capabilities}
      onChange={onChange}
      accentColor={accentColor}
      isDisabled={isDisabled}
    />
    <AdvancedSettings
      settings={settings}
      capabilities={capabilities}
      onChange={onChange}
      isDisabled={isDisabled}
    />
  </div>
);
