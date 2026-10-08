import { cn } from "@shared/lib";
import { Spinner } from "../loading";
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
    ref?: React.Ref<HTMLButtonElement>;
  };

/** primary / secondary / ghost / danger in sm (24px), md (30px) and lg (36px). */
export const Button = ({
  variant = "secondary",
  size = "md",
  isFullWidth = false,
  type = "button",
  icon,
  iconRight,
  isLoading = false,
  className,
  children,
  onClick,
  ref,
  ...rest
}: ButtonProps): React.ReactElement => {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    if (isLoading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cn(buttonClassName({ variant, size, isFullWidth }), className)}
      aria-busy={isLoading || undefined}
      aria-disabled={isLoading ? true : rest["aria-disabled"]}
      onClick={handleClick}
    >
      {isLoading ? <Spinner size="sm" tone="current" isDecorative /> : icon}
      {children}
      {iconRight}
    </button>
  );
};
