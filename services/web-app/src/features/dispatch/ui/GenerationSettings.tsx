import { Badge, Button, Card, Field, SegmentedControl, Switch } from "@shared/ui";

import {
  activeReasoningMode,
  isReasoningActive,
  maxReasoningBudget,
  MIN_REASONING_BUDGET,
  REASONING_BUDGET_STEP,
} from "../model/dispatchSettings";
import { AdvancedSettings } from "./AdvancedSettings";
import { RangeInput } from "./RangeInput";

import type { ModelCapabilities, ReasoningEffort } from "@entities/ai-provider";
import type { ProviderDispatchSettings } from "../model/dispatchSettings";

const FALLBACK_EFFORTS: ReasoningEffort[] = ["low", "medium", "high"];
const DEFAULT_EFFORT_LEVEL = "medium";
// The "use the model's default" choice where reasoning is always on; no effort level is named so.
const MODEL_DEFAULT_EFFORT = "model-default";
const TEMPERATURE_STEP = 0.05;
const DEFAULT_MAX_TEMPERATURE = 2;

export type GenerationSettingsProps = {
  settings: ProviderDispatchSettings;
  /** What the selected model accepts; while unknown every control is offered. */
  capabilities: ModelCapabilities | undefined;
  onChange: (patch: Partial<ProviderDispatchSettings>) => void;
  isDisabled: boolean;
};

const formatTokens = (tokens: number): string => tokens.toLocaleString("en-US");

const hintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-meta)",
  lineHeight: "var(--lh-body)",
  color: "var(--fg-2)",
};

const valueStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-control)",
  color: "var(--fg-0)",
  fontVariantNumeric: "tabular-nums",
};

/** A setting the model decides, so there is nothing to switch: its name, a badge and why. */
const FixedSetting = ({
  label,
  badge,
  hint,
}: {
  label: string;
  badge: React.ReactNode;
  hint: string;
}): React.ReactElement => (
  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
      <span style={{ fontSize: "var(--fs-control)", color: "var(--fg-0)" }}>{label}</span>
      {badge}
    </div>
    <p style={hintStyle}>{hint}</p>
  </div>
);

/* ── Reasoning ─────────────────────────────────────────────── */
const ReasoningControls = ({
  settings,
  capabilities: caps,
  onChange,
  isDisabled,
}: GenerationSettingsProps): React.ReactElement => {
  if (caps?.thinking === "none") {
    return (
      <FixedSetting
        label="Reasoning"
        badge={<Badge>Not supported</Badge>}
        hint="This model does not reason."
      />
    );
  }
  const isAlways = caps?.thinking === "always";
  const isOn = isReasoningActive(settings, caps);
  const modes = caps?.reasoning_modes ?? ["effort", "budget"];
  const mode = activeReasoningMode(settings, caps);
  const levels = caps?.effort_levels ?? FALLBACK_EFFORTS;
  const budgetMax = maxReasoningBudget(caps);
  const budgetMin = caps?.min_reasoning_budget ?? MIN_REASONING_BUDGET;
  const effortOptions = [
    ...(isAlways
      ? [
          {
            value: MODEL_DEFAULT_EFFORT,
            label: caps.default_effort ? `Default (${caps.default_effort})` : "Default",
          },
        ]
      : []),
    ...levels.map((level) => ({ value: level, label: level })),
  ];
  const implicitEffort = isAlways
    ? MODEL_DEFAULT_EFFORT
    : (caps?.default_effort ?? DEFAULT_EFFORT_LEVEL);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {isAlways ? (
        <FixedSetting
          label="Reasoning"
          badge={<Badge tone="accent">Always on</Badge>}
          hint="This model always reasons — choose how hard it thinks."
        />
      ) : (
        <Switch
          label="Reasoning"
          description={
            isOn
              ? "The model thinks before it answers: slower, often more thorough."
              : "The model answers straight away."
          }
          checked={isOn}
          disabled={isDisabled}
          onCheckedChange={(checked) => {
            onChange({ isReasoningOn: checked });
          }}
        />
      )}

      {isOn && modes.length > 1 && mode !== null && (
        <SegmentedControl
          aria-label="Reasoning mode"
          size="sm"
          options={modes.map((m) => ({
            value: m,
            label: m === "effort" ? "Effort" : "Budget",
            isDisabled,
          }))}
          value={mode}
          onValueChange={(next) => {
            onChange({ reasoningMode: next });
          }}
          className="self-start"
        />
      )}

      {isOn && mode === "effort" && (
        <SegmentedControl
          aria-label="Reasoning effort"
          size="sm"
          options={effortOptions.map((option) => ({ ...option, isDisabled }))}
          value={settings.reasoningEffort ?? implicitEffort}
          onValueChange={(next) => {
            onChange({
              reasoningEffort: levels.find((level) => level === next) ?? null,
            });
          }}
          className="self-start"
        />
      )}

      {isOn && mode === "budget" && (
        <Field
          label="Thinking budget"
          labelAside={
            <span style={valueStyle}>
              {formatTokens(Math.min(settings.reasoningBudget, budgetMax))} tokens
            </span>
          }
        >
          <RangeInput
            min={budgetMin}
            max={budgetMax}
            step={REASONING_BUDGET_STEP}
            value={Math.min(Math.max(settings.reasoningBudget, budgetMin), budgetMax)}
            disabled={isDisabled}
            onChange={(e) => {
              onChange({ reasoningBudget: parseInt(e.target.value, 10) });
            }}
          />
        </Field>
      )}
    </div>
  );
};

/* ── Temperature ───────────────────────────────────────────── */
const TemperatureControl = ({
  settings,
  capabilities: caps,
  onChange,
  isDisabled,
}: GenerationSettingsProps): React.ReactElement => {
  if (caps && !caps.temperature) {
    return (
      <FixedSetting
        label="Temperature"
        badge={<Badge>Model default</Badge>}
        hint="A temperature is not accepted by this model — it uses its own."
      />
    );
  }
  const max = caps?.max_temperature ?? DEFAULT_MAX_TEMPERATURE;
  const isReasoning = isReasoningActive(settings, caps);
  const isUnset = settings.temperature === null;

  return (
    <Field
      label="Temperature"
      hint={
        <span style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
          <span>0 — Deterministic</span>
          <span>
            {isReasoning ? "Not sent while reasoning is on" : "Unset — the model's default"}
          </span>
          <span>{max} — Creative</span>
        </span>
      }
      labelAside={
        <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span
            data-testid="temperature-value"
            style={{ ...valueStyle, color: isUnset ? "var(--fg-2)" : "var(--fg-0)" }}
          >
            {isUnset ? "Default" : settings.temperature}
          </span>
          {!isUnset && (
            <Button
              variant="ghost"
              size="sm"
              title="Use the model's default temperature"
              disabled={isDisabled}
              onClick={() => {
                onChange({ temperature: null });
              }}
            >
              Reset
            </Button>
          )}
        </span>
      }
    >
      <RangeInput
        min={0}
        max={max}
        step={TEMPERATURE_STEP}
        value={settings.temperature ?? max / 2}
        disabled={isDisabled || isReasoning}
        onChange={(e) => {
          onChange({ temperature: parseFloat(e.target.value) });
        }}
        // Unset reads as neutral: the thumb sits mid-scale but no temperature is sent. fg-2, not
        // fg-3: the browser draws the empty track dark or light against the accent's lightness.
        style={isUnset ? { accentColor: "var(--fg-2)" } : undefined}
      />
    </Field>
  );
};

const Divider = (): React.ReactElement => (
  <hr style={{ margin: 0, border: 0, borderTop: "1px solid var(--border)" }} />
);

/** Reasoning, temperature and the advanced settings — each offered only as far as the model accepts it. */
export const GenerationSettings = (props: GenerationSettingsProps): React.ReactElement => (
  <Card padding="md" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
    <ReasoningControls {...props} />
    <Divider />
    <TemperatureControl {...props} />
    <Divider />
    <AdvancedSettings {...props} />
  </Card>
);
