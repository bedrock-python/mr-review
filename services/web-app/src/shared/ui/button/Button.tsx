import { cn } from "@shared/lib";
import { Spinner } from "../loading";
import { Tooltip } from "../tooltip";
import { buttonClassName } from "./buttonClassName";
import type { ButtonClassOptions } from "./buttonClassName";

export type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> &
  ButtonClassOptions & {
    /** Defaults to "button": a <button> in a form must opt into submitting it. */
    type?: "button" | "submit" | "reset";
    /** Before the label; replaced by a spinner while loading. Use 14px lucide icons. */
    icon?: React.ReactNode;
    /** After the label: an arrow, a count, a shortcut hint. */
    iconRight?: React.ReactNode;
    /**
     * Shows a spinner and ignores clicks, but stays focusable: focus is not dropped to <body>
     * mid-action, as it would be if the button were disabled.
     */
    isLoading?: boolean;
    /** A hint on hover and keyboard focus. */
    tooltip?: React.ReactNode;
    /** A key that does the same, shown in the tooltip while the button is enabled. */
    shortcut?: string;
    /**
     * Why the button does nothing right now. A string makes it `aria-disabled` — still
     * focusable and hoverable, drawn like `disabled`, clicks ignored — with the reason as its
     * tooltip; `null` is enabled. Pass `null` rather than leaving it out while the reason can
     * come and go, so the element (and its focus) stays the same.
     */
    disabledReason?: string | null;
    ref?: React.Ref<HTMLButtonElement>;
  };

/** primary / secondary / ghost / danger in xs (20px), sm (24px), md (30px) and lg (36px). */
export const Button = ({
  variant = "secondary",
  size = "md",
  tone = "default",
  isFullWidth = false,
  type = "button",
  icon,
  iconRight,
  isLoading = false,
  tooltip,
  shortcut,
  disabledReason,
  className,
  children,
  onClick,
  ref,
  ...rest
}: ButtonProps): React.ReactElement => {
  const isUnavailable = typeof disabledReason === "string";
  const isInert = isLoading || isUnavailable || rest["aria-disabled"] === true;
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    if (isInert) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const button = (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cn(buttonClassName({ variant, size, tone, isFullWidth }), className)}
      aria-busy={isLoading || undefined}
      aria-disabled={isLoading || isUnavailable ? true : rest["aria-disabled"]}
      onClick={handleClick}
    >
      {isLoading ? <Spinner size="sm" tone="current" isDecorative /> : icon}
      {children}
      {iconRight}
    </button>
  );

  if (tooltip === undefined && disabledReason === undefined) return button;
  const content = isUnavailable ? disabledReason : tooltip;
  return (
    <Tooltip
      content={content}
      isDisabled={content === undefined || content === null}
      {...(shortcut === undefined || isUnavailable ? {} : { shortcut })}
    >
      {button}
    </Tooltip>
  );
};
