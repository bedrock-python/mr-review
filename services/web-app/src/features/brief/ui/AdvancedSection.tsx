import { useId, useState } from "react";
import {
  DEFAULT_PROMPT_BUDGET_CHARS,
  MAX_PROMPT_BUDGET_CHARS,
  MIN_PROMPT_BUDGET_CHARS,
} from "@entities/review";
import type { BriefConfig, ExcludedFiles } from "@entities/review";
import { excludedSummary } from "../lib";
import { PathFilters } from "./PathFilters";
import { CHECKBOX_STYLE, HINT_STYLE, SECTION_STYLE } from "./styles";

const CHARS_PER_TOKEN = 4;
const BUDGET_STEP = 10_000;

export type AdvancedSectionProps = {
  config: BriefConfig;
  excluded: ExcludedFiles | undefined;
  isCheckingExcluded: boolean;
  onChange: (patch: Partial<BriefConfig>) => void;
};

type CheckboxRowProps = {
  label: string;
  hint: string;
  isChecked: boolean;
  onToggle: (isChecked: boolean) => void;
};

const CheckboxRow = ({
  label,
  hint,
  isChecked,
  onToggle,
}: CheckboxRowProps): React.ReactElement => (
  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
    <input
      type="checkbox"
      checked={isChecked}
      onChange={(event) => {
        onToggle(event.target.checked);
      }}
      style={{ ...CHECKBOX_STYLE, marginTop: 3 }}
    />
    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 13, color: isChecked ? "var(--fg-0)" : "var(--fg-2)" }}>
        {label}
      </span>
      <span style={HINT_STYLE}>{hint}</span>
    </span>
  </label>
);

const clampBudget = (value: number): number =>
  Math.min(Math.max(value, MIN_PROMPT_BUDGET_CHARS), MAX_PROMPT_BUDGET_CHARS);

export const AdvancedSection = ({
  config,
  excluded,
  isCheckingExcluded,
  onChange,
}: AdvancedSectionProps): React.ReactElement => {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null);
  const summary = excludedSummary(excluded);

  const commitBudget = (): void => {
    if (budgetDraft === null) return;
    const parsed = Number.parseInt(budgetDraft, 10);
    onChange({
      prompt_budget_chars: Number.isNaN(parsed) ? DEFAULT_PROMPT_BUDGET_CHARS : clampBudget(parsed),
    });
    setBudgetDraft(null);
  };

  return (
    <section style={SECTION_STYLE}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={`${id}-panel`}
        onClick={() => {
          setIsOpen((open) => !open);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "6px 0",
          borderTop: "1px solid var(--border)",
          textAlign: "left",
        }}
      >
        <span className="mono" style={{ fontSize: 10, color: "var(--fg-2)" }}>
          {isOpen ? "▾" : "▸"}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--fg-3)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Advanced
        </span>
        {summary && (
          <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)", marginLeft: "auto" }}>
            {summary}
          </span>
        )}
      </button>
      {isOpen && (
        <div
          id={`${id}-panel`}
          style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 10 }}
        >
          <PathFilters
            config={config}
            excluded={excluded}
            isChecking={isCheckingExcluded}
            onChange={onChange}
          />
          <CheckboxRow
            label="Number diff lines"
            hint="Every added and unchanged diff line carries its line number in the new file, and the model must anchor comments to those numbers — far fewer comments land on the wrong line."
            isChecked={config.annotate_line_numbers}
            onToggle={(isChecked) => {
              onChange({ annotate_line_numbers: isChecked });
            }}
          />
          <CheckboxRow
            label="Show the previous iteration's comments"
            hint="From the second iteration on, the comments kept last time are listed as already reported, so the model does not repeat them unless they are still unresolved."
            isChecked={config.include_previous_comments}
            onToggle={(isChecked) => {
              onChange({ include_previous_comments: isChecked });
            }}
          />
          <div>
            <label className="field-label" htmlFor={`${id}-budget`}>
              Prompt budget (characters)
            </label>
            <input
              id={`${id}-budget`}
              className="field"
              type="number"
              inputMode="numeric"
              min={MIN_PROMPT_BUDGET_CHARS}
              max={MAX_PROMPT_BUDGET_CHARS}
              step={BUDGET_STEP}
              value={budgetDraft ?? String(config.prompt_budget_chars)}
              aria-describedby={`${id}-budget-hint`}
              style={{ width: 160 }}
              onChange={(event) => {
                setBudgetDraft(event.target.value);
              }}
              onBlur={commitBudget}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitBudget();
              }}
            />
            <div id={`${id}-budget-hint`} style={{ ...HINT_STYLE, marginTop: 4 }}>
              {`≈ ${Math.round(config.prompt_budget_chars / CHARS_PER_TOKEN).toLocaleString()} tokens (estimate: characters ÷ 4). The default, ${DEFAULT_PROMPT_BUDGET_CHARS.toLocaleString()}, suits a ~200k-token model. Instructions and the diff come first, then the MR description, previous comments, project context, full files, tests, related code and commit history — what does not fit is cut from the end of that list.`}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
