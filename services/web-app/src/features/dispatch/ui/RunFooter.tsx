import { ArrowRight, RotateCcw, Sparkles, Square, TriangleAlert } from "lucide-react";

import { Button, ICON_SIZE } from "@shared/ui";

import { pluralize } from "../model/runOutcome";
import { ColumnFooter } from "./StageLayout";

import type { RunOutcomeSummary } from "../model/runOutcome";
import type { DispatchStatus } from "../model/useDispatchRun";

export type RunFooterProps = {
  status: DispatchStatus;
  /** The selected provider and model: what Generate runs. */
  providerName: string;
  model: string;
  canGenerate: boolean;
  /** Comments on the iteration now, from the review. */
  existingCommentsCount: number;
  /** What the finished run saved; set once it is done. */
  outcome: RunOutcomeSummary | null;
  onGenerate: () => void;
  onStop: () => void;
  onPolish: () => void;
};

const inlineIconStyle: React.CSSProperties = {
  display: "inline-block",
  verticalAlign: "-2px",
  marginRight: "var(--space-2)",
};

const PolishButton = ({
  count,
  variant,
  onClick,
}: {
  count: number;
  variant: "primary" | "secondary";
  onClick: () => void;
}): React.ReactElement => (
  <Button
    size="lg"
    variant={variant}
    iconRight={<ArrowRight size={ICON_SIZE.inline} aria-hidden="true" />}
    onClick={onClick}
  >
    Polish {pluralize(count, "comment")}
  </Button>
);

const RunAgainButton = ({
  variant,
  onClick,
}: {
  variant: "primary" | "secondary";
  onClick: () => void;
}): React.ReactElement => (
  <Button
    size="lg"
    variant={variant}
    icon={<RotateCcw size={ICON_SIZE.inline} aria-hidden="true" />}
    onClick={onClick}
  >
    Run again
  </Button>
);

type FooterContent = {
  summary: React.ReactNode;
  secondary?: React.ReactNode;
  primary?: React.ReactNode;
};

const doneContent = (
  outcome: RunOutcomeSummary,
  onGenerate: () => void,
  onPolish: () => void
): FooterContent => {
  const count = outcome.savedCount;
  if (outcome.isKeptPrevious) {
    // Nothing new was saved: another run is the way on, the old comments the way around.
    return {
      summary: (
        <span>
          {count > 0 ? `${pluralize(count, "comment")} kept from before` : "No comments saved"}
        </span>
      ),
      secondary:
        count > 0 ? <PolishButton count={count} variant="secondary" onClick={onPolish} /> : null,
      primary: <RunAgainButton variant="primary" onClick={onGenerate} />,
    };
  }
  return {
    summary: (
      <>
        <span>{`${pluralize(count, "comment")} saved`}</span>
        {outcome.skippedCount > 0 && (
          <span style={{ color: "var(--c-warn-fg)" }}>
            {` · ${pluralize(outcome.skippedCount, "item")} couldn't be parsed`}
          </span>
        )}
      </>
    ),
    secondary: count > 0 ? <RunAgainButton variant="secondary" onClick={onGenerate} /> : null,
    primary:
      count > 0 ? (
        <PolishButton count={count} variant="primary" onClick={onPolish} />
      ) : (
        <RunAgainButton variant="primary" onClick={onGenerate} />
      ),
  };
};

/**
 * The stage's next step for the run's state: Generate; Stop while it streams; Polish what it
 * saved, or run again. A failed run offers its retry in its notice, so the footer doesn't.
 */
export const RunFooter = ({
  status,
  providerName,
  model,
  canGenerate,
  existingCommentsCount,
  outcome,
  onGenerate,
  onStop,
  onPolish,
}: RunFooterProps): React.ReactElement => {
  const existing = existingCommentsCount;
  const onIteration = existing > 0 ? ` · ${pluralize(existing, "comment")} on this iteration` : "";
  const replaceWarning = `${pluralize(existing, "existing comment")} will be replaced — a failed run keeps them`;
  let content: FooterContent;

  if (status === "idle") {
    content = {
      summary:
        existing > 0 ? (
          // The footer is one line; the title keeps the whole warning when it gets cut.
          <span title={replaceWarning}>
            <TriangleAlert
              size={ICON_SIZE.inline}
              aria-hidden="true"
              color="var(--c-warn-fg)"
              style={inlineIconStyle}
            />
            {replaceWarning}
          </span>
        ) : (
          `${providerName}${model ? ` · ${model}` : ""}`
        ),
      primary: (
        <Button
          size="lg"
          variant="primary"
          icon={<Sparkles size={ICON_SIZE.inline} aria-hidden="true" />}
          disabled={!canGenerate}
          onClick={onGenerate}
        >
          Generate review
          {/* Read as "Generate review gpt-4o"; the flex gap does the spacing on screen. */}
          {model && " "}
          {model && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--fs-meta)",
                fontWeight: "var(--fw-regular)",
              }}
            >
              {model}
            </span>
          )}
        </Button>
      ),
    };
  } else if (status === "streaming") {
    content = {
      summary: `Generating with ${providerName}…`,
      secondary: (
        <Button
          size="lg"
          icon={<Square size={ICON_SIZE.inline} aria-hidden="true" />}
          onClick={onStop}
        >
          Stop
        </Button>
      ),
      primary: (
        <Button size="lg" variant="primary" isLoading>
          Generating…
        </Button>
      ),
    };
  } else if (status === "done" && outcome) {
    content = doneContent(outcome, onGenerate, onPolish);
  } else if (status === "stopped") {
    content = {
      summary: `Generation stopped${onIteration}`,
      secondary:
        existing > 0 ? (
          <PolishButton count={existing} variant="secondary" onClick={onPolish} />
        ) : null,
      primary: <RunAgainButton variant="primary" onClick={onGenerate} />,
    };
  } else {
    // The notice above says what failed; the iteration may have kept what arrived before it.
    content = {
      summary:
        existing > 0
          ? `${pluralize(existing, "comment")} on this iteration`
          : "No comments on this iteration",
      secondary:
        existing > 0 ? (
          <PolishButton count={existing} variant="secondary" onClick={onPolish} />
        ) : null,
    };
  }

  return (
    <ColumnFooter
      aria-label="Generation actions"
      summary={content.summary}
      secondaryActions={content.secondary}
      primaryAction={content.primary}
    />
  );
};
