import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { useReviewPresets } from "@entities/review-preset";
import { Button, Callout, ICON_SIZE, StageFooter } from "@shared/ui";
import { BUILTIN_PRESET_CARDS, formatCompactCount, includedContextSummary } from "../lib";
import type { PromptPreviewState } from "../model";
import type { BriefConfig, DiffSizeInfo, ExcludedFiles } from "@entities/review";

// The footer's summary line clips; a message in its place wraps instead.
const WRAPPING: React.CSSProperties = { whiteSpace: "normal" };

export type BriefFooterProps = {
  config: BriefConfig;
  diffSize: DiffSizeInfo;
  preview: PromptPreviewState;
  excluded: ExcludedFiles | undefined;
  saveError: string | null;
  isSaving: boolean;
  nothingToReview: boolean;
  onDispatch: () => void;
  onEditFilters: () => void;
};

/** "Thorough · diff + description · ≈ 2.5k tokens": the brief at a glance. */
const useBriefSummary = ({
  config,
  diffSize,
  preview,
  excluded,
}: Pick<BriefFooterProps, "config" | "diffSize" | "preview" | "excluded">): string => {
  const { data: presets } = useReviewPresets();
  const savedName = presets?.find((preset) => preset.id === config.custom_preset_id)?.name;
  const builtinName = BUILTIN_PRESET_CARDS.find((card) => card.id === config.preset)?.label;
  const parts = [savedName ?? builtinName ?? config.preset, includedContextSummary(config)];

  if (preview.preview && !preview.isStale) {
    parts.push(`≈ ${formatCompactCount(preview.preview.estimated_tokens)} tokens`);
  } else if (config.include_diff && !diffSize.isLoading && diffSize.tokens > 0) {
    parts.push(`diff ≈ ${formatCompactCount(diffSize.tokens)} tokens`);
  }
  const excludedCount = excluded?.excluded.length ?? 0;
  if (excludedCount > 0) {
    parts.push(`${String(excludedCount)} file${excludedCount === 1 ? "" : "s"} excluded`);
  }
  return parts.join(" · ");
};

/** The Brief's last line: what will be sent, why it cannot be yet, and the way on. */
export const BriefFooter = ({
  saveError,
  isSaving,
  nothingToReview,
  onDispatch,
  onEditFilters,
  ...summaryInput
}: BriefFooterProps): React.ReactElement => {
  const summary = useBriefSummary(summaryInput);
  const totalFiles = summaryInput.excluded?.total ?? 0;

  let message: React.ReactNode = null;
  if (saveError) {
    message = (
      <Callout tone="danger" size="sm" style={WRAPPING}>
        {saveError}
      </Callout>
    );
  } else if (nothingToReview) {
    message = (
      <Callout tone="danger" size="sm" style={WRAPPING}>
        {`All ${String(totalFiles)} changed files are excluded by the path filters, so there is nothing to review. Loosen the include or exclude patterns under Advanced.`}
      </Callout>
    );
  }

  return (
    <StageFooter
      aria-label="Brief actions"
      summary={message ?? <span title={summary}>{summary}</span>}
      secondaryActions={
        nothingToReview && !saveError ? (
          <Button
            icon={<SlidersHorizontal size={ICON_SIZE.inline} aria-hidden="true" />}
            onClick={onEditFilters}
          >
            Edit path filters
          </Button>
        ) : undefined
      }
      primaryAction={
        <Button
          variant="primary"
          size="lg"
          iconRight={<ArrowRight size={ICON_SIZE.inline} aria-hidden="true" />}
          isLoading={isSaving}
          disabled={nothingToReview}
          onClick={onDispatch}
        >
          Continue to Dispatch
        </Button>
      }
    />
  );
};
