import { cn } from "@shared/lib";
import { toneAttribute } from "./tone";
import type { Tone } from "./tone";

export type BadgeProps = {
  tone?: Tone;
  /** soft: 12% fill and 40% border; outline: border only. */
  variant?: "soft" | "outline";
  /** A 6px dot in the tone's hue before the text. */
  hasDot?: boolean;
  /** The dot pulses: something is running. Still under reduced motion. */
  isDotPulsing?: boolean;
  /** A 12px icon instead of the dot. */
  icon?: React.ReactNode;
  title?: string;
  className?: string;
  /** Short text; drawn in mono small caps. */
  children: React.ReactNode;
};

/** A small, non-interactive tag: mono 10px small caps in a tone. */
export const Badge = ({
  tone = "neutral",
  variant = "soft",
  hasDot = false,
  isDotPulsing = false,
  icon,
  title,
  className,
  children,
}: BadgeProps): React.ReactElement => (
  <span
    className={cn("ui-badge", variant === "outline" && "ui-badge--outline", className)}
    data-tone={toneAttribute(tone)}
    title={title}
  >
    {icon}
    {icon === undefined && hasDot && (
      <span
        className={cn("ui-badge__dot", isDotPulsing && "ui-badge__dot--pulse")}
        aria-hidden="true"
      />
    )}
    {children}
  </span>
);
