import { ArrowRight, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";

import { Button, ICON_SIZE } from "@shared/ui";

import { pluralize } from "../model/runOutcome";
import { ColumnFooter } from "./StageLayout";

import type { ButtonProps } from "@shared/ui";
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
  /** The primary button, whatever it says: a run started elsewhere moves the focus here. */
  primaryRef: React.Ref<HTMLButtonElement>;
  onGenerate: () => void;
  onPolish: () => void;
};

const inlineIconStyle: React.CSSProperties = {
  display: "inline-block",
  verticalAlign: "-2px",
  marginRight: "var(--space-2)",
};

/** What a footer button does and says; the slot decides its look. */
type Action = {
  /** Keeps a secondary button's node, and so its focus, only while it does the same thing. */
  key: string;
  props: Pick<
    ButtonProps,
    "icon" | "iconRight" | "isLoading" | "disabled" | "onClick" | "children"
  >;
};

type FooterContent = {
  summary: React.ReactNode;
  secondary?: Action | null;
  primary?: Action;
};

const polishAction = (count: number, onPolish: () => void): Action => ({
  key: "polish",
  props: {
    iconRight: <ArrowRight size={ICON_SIZE.inline} aria-hidden="true" />,
    onClick: onPolish,
    children: `Polish ${pluralize(count, "comment")}`,
  },
});

const runAgainAction = (onGenerate: () => void): Action => ({
  key: "run-again",
  props: {
    icon: <RotateCcw size={ICON_SIZE.inline} aria-hidden="true" />,
    onClick: onGenerate,
    children: "Run again",
  },
});

const generateAction = (model: string, canGenerate: boolean, onGenerate: () => void): Action => ({
  key: "generate",
  props: {
    icon: <Sparkles size={ICON_SIZE.inline} aria-hidden="true" />,
    disabled: !canGenerate,
    onClick: onGenerate,
    children: (
      <>
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
      </>
    ),
  },
});

// Busy, not disabled: it keeps the focus, and a second click does nothing.
const BUSY_ACTION: Action = { key: "busy", props: { isLoading: true, children: "Generating…" } };

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
      secondary: count > 0 ? polishAction(count, onPolish) : null,
      primary: runAgainAction(onGenerate),
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
    secondary: count > 0 ? runAgainAction(onGenerate) : null,
    primary: count > 0 ? polishAction(count, onPolish) : runAgainAction(onGenerate),
  };
};

/**
 * The stage's next step for the run's state: Generate; a busy Generating… while it streams;
 * Polish what it saved, or run again. Before any run that would replace comments — the first
 * one, or one after a stop or a failure — it says so.
 *
 * The primary button is one node throughout (Generate → Generating… → Polish or Run again), so
 * the focus stays on the next step. Stop is not in the footer but on the run's own line, so no
 * click meant for Generate or Run again can land on it.
 */
export const RunFooter = ({
  status,
  providerName,
  model,
  canGenerate,
  existingCommentsCount: existing,
  outcome,
  primaryRef,
  onGenerate,
  onPolish,
}: RunFooterProps): React.ReactElement => {
  const replaceWarning = `${pluralize(existing, "existing comment")} will be replaced — a failed run keeps them`;
  // The footer is one line; the title keeps the whole warning when it gets cut.
  const warning =
    existing > 0 ? (
      <span title={replaceWarning}>
        <TriangleAlert
          size={ICON_SIZE.inline}
          aria-hidden="true"
          color="var(--c-warn-fg)"
          style={inlineIconStyle}
        />
        {replaceWarning}
      </span>
    ) : null;
  const polishExisting = existing > 0 ? polishAction(existing, onPolish) : null;
  let content: FooterContent;

  if (status === "idle") {
    content = {
      summary: warning ?? `${providerName}${model ? ` · ${model}` : ""}`,
      primary: generateAction(model, canGenerate, onGenerate),
    };
  } else if (status === "streaming") {
    content = { summary: `Generating with ${providerName}…`, primary: BUSY_ACTION };
  } else if (status === "done" && outcome) {
    content = doneContent(outcome, onGenerate, onPolish);
  } else if (status === "stopped") {
    content = {
      summary: warning ?? "Generation stopped",
      secondary: polishExisting,
      primary: runAgainAction(onGenerate),
    };
  } else {
    // A failed run: its notice says what went wrong and offers the same retry.
    content = {
      summary: warning ?? "No comments on this iteration",
      secondary: polishExisting,
      primary: runAgainAction(onGenerate),
    };
  }

  const { secondary, primary } = content;
  return (
    <ColumnFooter
      aria-label="Generation actions"
      summary={content.summary}
      secondaryActions={
        secondary && (
          <Button key={secondary.key} size="lg" variant="secondary" {...secondary.props} />
        )
      }
      primaryAction={
        primary && (
          <Button key="primary" ref={primaryRef} size="lg" variant="primary" {...primary.props} />
        )
      }
    />
  );
};
