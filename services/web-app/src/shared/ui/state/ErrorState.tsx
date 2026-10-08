import { RotateCw, TriangleAlert } from "lucide-react";
import { cn } from "@shared/lib";
// The class, not the Button component: the app's error boundary renders this from the entry
// chunk, and Button brings the tooltip (Radix, floating-ui) with it.
import { buttonClassName } from "../button/buttonClassName";
import { ICON_SIZE } from "../ICON_SIZE";

export type ErrorStateProps = {
  /** What could not be done: "Could not load merge requests". */
  title?: React.ReactNode;
  /** The server's message or the reason, shown as is. */
  message?: React.ReactNode;
  /** Shows a Retry button. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Extra actions after Retry: "Open Settings". */
  actions?: React.ReactNode;
  size?: "sm" | "md";
  isFill?: boolean;
  className?: string;
};

/** A load that failed, in place of its content: what, why, and Retry. Announced at once. */
export const ErrorState = ({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Retry",
  actions,
  size = "md",
  isFill = false,
  className,
}: ErrorStateProps): React.ReactElement => (
  <div
    role="alert"
    className={cn(
      "ui-state",
      "ui-state--error",
      size === "sm" && "ui-state--sm",
      isFill && "ui-state--fill",
      className
    )}
  >
    <span className="ui-state__icon" aria-hidden="true">
      <TriangleAlert size={size === "sm" ? ICON_SIZE.inline : ICON_SIZE.state} />
    </span>
    <p className="ui-state__title">{title}</p>
    {message !== undefined && <p className="ui-state__description">{message}</p>}
    {(onRetry !== undefined || actions !== undefined) && (
      <div className="ui-state__actions">
        {onRetry !== undefined && (
          <button type="button" className={buttonClassName({ size: "sm" })} onClick={onRetry}>
            <RotateCw size={ICON_SIZE.inline} aria-hidden="true" />
            {retryLabel}
          </button>
        )}
        {actions}
      </div>
    )}
  </div>
);
