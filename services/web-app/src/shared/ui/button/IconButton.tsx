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
  type = "button",
  className,
  ref,
  ...rest
}: IconButtonProps): React.ReactElement => {
  const button = (
    <button
      {...rest}
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={isPressed}
      className={cn(
        "ui-icon-btn",
        size === "sm" && "ui-icon-btn--sm",
        variant !== "ghost" && `ui-icon-btn--${variant}`,
        className
      )}
    >
      {icon}
    </button>
  );

  if (tooltip === false) return button;
  return (
    <Tooltip
      content={tooltip ?? label}
      {...(shortcut === undefined ? {} : { shortcut })}
      {...(tooltipSide === undefined ? {} : { side: tooltipSide })}
    >
      {button}
    </Tooltip>
  );
};
