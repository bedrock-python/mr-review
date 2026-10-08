import { cn } from "@shared/lib";

export type StageFooterProps = {
  /** Where things stand, in one line: "Thorough · diff + description · ~1.7k tokens". */
  summary?: React.ReactNode;
  /**
   * Why the next step cannot be taken yet, or what went wrong: a Callout that wraps onto as
   * many lines as it needs. Shown in place of the summary.
   */
  message?: React.ReactNode;
  /** Quieter actions before the primary one: Dry run, Save as JSON. */
  secondaryActions?: React.ReactNode;
  /** The way forward, usually a large primary Button: "Continue to Dispatch". */
  primaryAction?: React.ReactNode;
  /**
   * The width of the stage's centred content column ("660px", "var(--dispatch-column)"): the
   * footer's content lines up with it instead of spanning the stage.
   */
  contentMaxWidth?: string;
  /** Names the bar for assistive tech. */
  "aria-label"?: string;
  className?: string;
};

/**
 * The bar at the bottom of a stage: a summary on the left, the next step on the right.
 * Sticks to the bottom of the stage's scroll area, so the next step is never below the fold.
 */
export const StageFooter = ({
  summary,
  message,
  secondaryActions,
  primaryAction,
  contentMaxWidth,
  "aria-label": ariaLabel = "Stage actions",
  className,
}: StageFooterProps): React.ReactElement => {
  const hasMessage = message !== undefined && message !== null && message !== false;
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={cn(
        "ui-stage-footer",
        contentMaxWidth !== undefined && "ui-stage-footer--column",
        className
      )}
      style={
        contentMaxWidth === undefined
          ? undefined
          : ({ "--stage-footer-content": contentMaxWidth } as React.CSSProperties)
      }
    >
      {hasMessage ? (
        <div className="ui-stage-footer__message">{message}</div>
      ) : (
        <div className="ui-stage-footer__summary">{summary}</div>
      )}
      <div className="ui-stage-footer__actions">
        {secondaryActions}
        {primaryAction}
      </div>
    </div>
  );
};
