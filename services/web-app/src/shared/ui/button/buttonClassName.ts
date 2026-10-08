import { cn } from "@shared/lib";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
/** xs 20px (inline actions in dense rows), sm 24, md 30, lg 36. */
export type ButtonSize = "xs" | "sm" | "md" | "lg";
/**
 * The colour of a quiet button's label. "danger" on a ghost button is a row-level Remove or
 * Delete: a red label without the danger variant's tinted fill.
 */
export type ButtonTone = "default" | "danger";

export type ButtonClassOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: ButtonTone;
  isFullWidth?: boolean;
};

/** The button look for an element that is not a <button>, such as a link styled as an action. */
export const buttonClassName = ({
  variant = "secondary",
  size = "md",
  tone = "default",
  isFullWidth = false,
}: ButtonClassOptions = {}): string =>
  cn(
    "ui-btn",
    `ui-btn--${variant}`,
    size !== "md" && `ui-btn--${size}`,
    tone === "danger" && "ui-btn--tone-danger",
    isFullWidth && "ui-btn--block"
  );
