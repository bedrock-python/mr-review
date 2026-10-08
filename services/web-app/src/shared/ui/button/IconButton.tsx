import { cn } from "@shared/lib";
import { Tooltip } from "../tooltip";
import type { TooltipProps } from "../tooltip";

export type IconButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "children" | "aria-label"
> & {
  /** The accessible name, and the tooltip unless `tooltip` says otherwise. Required. */
  label: string;
  /** A 16px lucide icon (14px for size "sm"). */
  icon: React.ReactNode;
  /** 24px (sm) or 30px (md) square. */
  size?: "sm" | "md";
  variant?: "ghost" | "secondary" | "danger";
  /** A toggle: sets aria-pressed and the pressed look. */
  isPressed?: boolean;
  /** A key that does the same, shown in the tooltip. */
  shortcut?: string;
  /** Tooltip text other than the label, or `false` for none. */
  tooltip?: React.ReactNode | false;
  tooltipSide?: TooltipProps["side"];
  /**
   * Why the button does nothing right now: `aria-disabled`, drawn like `disabled`, clicks
   * ignored, and the reason as its tooltip. `null` (or leaving it out) is enabled.
   */
  disabledReason?: string | null;
  /**
   * A dot in the corner: something behind the button is on (a filter, an update). Say what in
   * the label or the tooltip; the dot itself is not announced.
   */
  hasIndicator?: boolean;
  type?: "button" | "submit" | "reset";
  ref?: React.Ref<HTMLButtonElement>;
};

/** A square icon-only button: always named, always with a tooltip on hover and focus. */
export const IconButton = ({
  label,
  icon,
  size = "md",
  variant = "ghost",
  isPressed,
  shortcut,
  tooltip,
  tooltipSide,
  disabledReason = null,
  hasIndicator = false,
  type = "button",
  className,
  onClick,
  ref,
  ...rest
}: IconButtonProps): React.ReactElement => {
  const isUnavailable = disabledReason !== null;
  const isInert = isUnavailable || rest["aria-disabled"] === true;
  const button = (
    <button
      {...rest}
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={isPressed}
      aria-disabled={isUnavailable ? true : rest["aria-disabled"]}
      className={cn(
        "ui-icon-btn",
        size === "sm" && "ui-icon-btn--sm",
        variant !== "ghost" && `ui-icon-btn--${variant}`,
        className
      )}
      onClick={(event) => {
        if (isInert) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {icon}
      {hasIndicator && <span className="ui-icon-btn__indicator" aria-hidden="true" />}
    </button>
  );

  if (tooltip === false && !isUnavailable) return button;
  const hint = tooltip === undefined || tooltip === false ? label : tooltip;
  const content = isUnavailable ? disabledReason : hint;
  return (
    <Tooltip
      content={content}
      {...(shortcut === undefined || isUnavailable ? {} : { shortcut })}
      {...(tooltipSide === undefined ? {} : { side: tooltipSide })}
    >
      {button}
    </Tooltip>
  );
};
