import { cn } from "@shared/lib";

export type SpinnerSize = "sm" | "md" | "lg";

export type SpinnerProps = {
  /** 12, 16 or 24px. */
  size?: SpinnerSize;
  /** Arc colour: accent, a quiet fg-2, or the surrounding text colour (inside a button). */
  tone?: "accent" | "muted" | "current";
  /** Announced name while it spins. */
  label?: string;
  /** Next to a visible "Loading…" text: hidden from assistive tech, the text speaks. */
  isDecorative?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

/** A spinning ring. Stops under prefers-reduced-motion (the global motion rule). */
export const Spinner = ({
  size = "md",
  tone = "accent",
  label = "Loading",
  isDecorative = false,
  className,
  style,
}: SpinnerProps): React.ReactElement => (
  <span
    role={isDecorative ? undefined : "status"}
    aria-label={isDecorative ? undefined : label}
    aria-hidden={isDecorative || undefined}
    className={cn(
      "ui-spinner",
      size !== "md" && `ui-spinner--${size}`,
      tone !== "accent" && `ui-spinner--${tone}`,
      className
    )}
    style={style}
  />
);
