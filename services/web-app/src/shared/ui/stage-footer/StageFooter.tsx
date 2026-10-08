import { cn } from "@shared/lib";

export type StageFooterProps = {
  /** Where things stand, in one line: "Thorough · diff + description · ~1.7k tokens". */
  summary?: React.ReactNode;
  /** Quieter actions before the primary one: Dry run, Save as JSON. */
  secondaryActions?: React.ReactNode;
  /** The way forward, usually a large primary Button: "Continue to Dispatch". */
  primaryAction?: React.ReactNode;
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
  secondaryActions,
  primaryAction,
  "aria-label": ariaLabel = "Stage actions",
  className,
}: StageFooterProps): React.ReactElement => (
  <div role="region" aria-label={ariaLabel} className={cn("ui-stage-footer", className)}>
    <div className="ui-stage-footer__summary">{summary}</div>
    <div className="ui-stage-footer__actions">
      {secondaryActions}
      {primaryAction}
    </div>
  </div>
);
