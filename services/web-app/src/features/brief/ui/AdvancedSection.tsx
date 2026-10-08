import { useState } from "react";
import {
  DEFAULT_PROMPT_BUDGET_CHARS,
  MAX_PROMPT_BUDGET_CHARS,
  MIN_PROMPT_BUDGET_CHARS,
} from "@entities/review";
import { Checkbox, Field, Input } from "@shared/ui";
import { excludedSummary } from "../lib";
import { BriefSection } from "./BriefSection";
import { Disclosure } from "./Disclosure";
import { PathFilters } from "./PathFilters";
import type { BriefConfig, ExcludedFiles } from "@entities/review";

const CHARS_PER_TOKEN = 4;
const BUDGET_STEP = 10_000;

const clampBudget = (value: number): number =>
  Math.min(Math.max(value, MIN_PROMPT_BUDGET_CHARS), MAX_PROMPT_BUDGET_CHARS);

export type AdvancedSectionProps = {
  config: BriefConfig;
  excluded: ExcludedFiles | undefined;
  isCheckingExcluded: boolean;
  onChange: (patch: Partial<BriefConfig>) => void;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  includeFieldRef: React.Ref<HTMLTextAreaElement>;
};

export const AdvancedSection = ({
  config,
  excluded,
  isCheckingExcluded,
  onChange,
  isOpen,
  onOpenChange,
  includeFieldRef,
}: AdvancedSectionProps): React.ReactElement => {
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null);

  const commitBudget = (): void => {
    if (budgetDraft === null) return;
    const parsed = Number.parseInt(budgetDraft, 10);
    onChange({
      prompt_budget_chars: Number.isNaN(parsed) ? DEFAULT_PROMPT_BUDGET_CHARS : clampBudget(parsed),
    });
    setBudgetDraft(null);
  };

  return (
    <Disclosure
      title="Advanced"
      summary={excludedSummary(excluded)}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
        <PathFilters
          config={config}
          excluded={excluded}
          isChecking={isCheckingExcluded}
          onChange={onChange}
          includeFieldRef={includeFieldRef}
        />
        <BriefSection
          as="h3"
          title="Prompt"
          description="How the diff is laid out, and how much the prompt may hold."
        >
          <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
            <Checkbox
              label="Number diff lines"
              description="Every added and unchanged diff line carries its line number in the new file, and the model must anchor comments to those numbers — far fewer comments land on the wrong line."
              checked={config.annotate_line_numbers}
              onCheckedChange={(annotate_line_numbers) => {
                onChange({ annotate_line_numbers });
              }}
            />
            <Checkbox
              label="Show the previous iteration's comments"
              description="From the second iteration on, the comments kept last time are listed as already reported, so the model does not repeat them unless they are still unresolved."
              checked={config.include_previous_comments}
              onCheckedChange={(include_previous_comments) => {
                onChange({ include_previous_comments });
              }}
            />
            <Field
              label="Prompt budget (characters)"
              hint={`≈ ${Math.round(config.prompt_budget_chars / CHARS_PER_TOKEN).toLocaleString()} tokens (estimate: characters ÷ 4). The default, ${DEFAULT_PROMPT_BUDGET_CHARS.toLocaleString()}, suits a ~200k-token model. The instructions take at most a quarter of it; the diff comes next, then the MR description, previous comments, project context, full files, tests, related code and commit history — what does not fit is cut from the end of that list.`}
            >
              <Input
                type="number"
                inputMode="numeric"
                isMono
                min={MIN_PROMPT_BUDGET_CHARS}
                max={MAX_PROMPT_BUDGET_CHARS}
                step={BUDGET_STEP}
                value={budgetDraft ?? String(config.prompt_budget_chars)}
                style={{ width: "auto", alignSelf: "flex-start" }}
                onChange={(event) => {
                  setBudgetDraft(event.target.value);
                }}
                onBlur={commitBudget}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitBudget();
                }}
              />
            </Field>
          </div>
        </BriefSection>
      </div>
    </Disclosure>
  );
};
