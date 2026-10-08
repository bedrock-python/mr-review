import { cn } from "@shared/lib";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonClassOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isFullWidth?: boolean;
};

/** The button look for an element that is not a <button>, such as a link styled as an action. */
export const buttonClassName = ({
  variant = "secondary",
  size = "md",
  isFullWidth = false,
}: ButtonClassOptions = {}): string =>
  cn(
    "ui-btn",
    `ui-btn--${variant}`,
    size !== "md" && `ui-btn--${size}`,
    isFullWidth && "ui-btn--block"
  );
