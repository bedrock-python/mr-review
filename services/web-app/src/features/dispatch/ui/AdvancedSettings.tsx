import { Badge, Button, Disclosure, Field, Input, Switch, Textarea } from "@shared/ui";

import {
  defaultMaxOutputTokens,
  MAX_OUTPUT_TOKENS,
  MIN_OUTPUT_TOKENS,
} from "../model/dispatchSettings";

import type { ModelCapabilities } from "@entities/ai-provider";
import type { ProviderDispatchSettings } from "../model/dispatchSettings";

const OUTPUT_TOKENS_STEP = 1000;
const SYSTEM_PROMPT_ROWS = 4;

export type AdvancedSettingsProps = {
  settings: ProviderDispatchSettings;
  capabilities: ModelCapabilities | undefined;
  onChange: (patch: Partial<ProviderDispatchSettings>) => void;
  isDisabled: boolean;
};

const formatTokens = (tokens: number): string => tokens.toLocaleString("en-US");

/** Output limit, structured output and the system prompt, folded away until asked for. */
export const AdvancedSettings = ({
  settings,
  capabilities: caps,
  onChange,
  isDisabled,
}: AdvancedSettingsProps): React.ReactElement => {
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
    <Disclosure
      variant="inline"
      headingLevel="none"
      title="Advanced"
      summary={changed > 0 ? <Badge tone="accent">{changed} changed</Badge> : undefined}
    >
      <div
        className="pt-(--space-2)"
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
      >
        <Field
          label="Max output tokens"
          hint={`Model maximum ${caps?.max_output_tokens ? formatTokens(caps.max_output_tokens) : "unknown"}; reasoning counts toward the limit. Empty uses the default.`}
        >
          <Input
            type="number"
            isMono
            min={MIN_OUTPUT_TOKENS}
            max={cap}
            step={OUTPUT_TOKENS_STEP}
            placeholder={outputPlaceholder}
            value={settings.maxOutputTokens ?? ""}
            disabled={isDisabled}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              onChange({ maxOutputTokens: Number.isFinite(parsed) ? parsed : null });
            }}
          />
        </Field>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "var(--space-3)",
          }}
        >
          <Switch
            label="Structured output"
            description={
              supportsStructured
                ? `Constrains the answer to the review JSON schema. Default for this provider: ${structuredDefault ? "on" : "off"}. Turn it off if the endpoint rejects it.`
                : "Not supported by this model."
            }
            checked={isStructured}
            disabled={isDisabled || !supportsStructured}
            onCheckedChange={(checked) => {
              onChange({ structuredOutput: checked });
            }}
          />
          {settings.structuredOutput !== null && supportsStructured && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isDisabled}
              onClick={() => {
                onChange({ structuredOutput: null });
              }}
            >
              Use the provider default
            </Button>
          )}
        </div>

        <Field
          label="System prompt"
          hint="Replaces the built-in system prompt for runs with this provider."
        >
          <Textarea
            rows={SYSTEM_PROMPT_ROWS}
            value={settings.systemPrompt}
            disabled={isDisabled}
            placeholder="Empty: the built-in reviewer prompt"
            onChange={(e) => {
              onChange({ systemPrompt: e.target.value });
            }}
          />
        </Field>
      </div>
    </Disclosure>
  );
};
