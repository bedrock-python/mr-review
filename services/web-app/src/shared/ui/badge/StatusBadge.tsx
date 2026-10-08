import { cn } from "@shared/lib";
import { Badge } from "./Badge";
import { toneAttribute } from "./tone";
import type { Tone } from "./tone";

/**
 * What a status means, not what colour it is. A draft or an opened MR is neutral; running is
 * active; posted is success; partly posted is warning; failed is danger.
 */
export type Status = "neutral" | "active" | "success" | "warning" | "danger" | "info";

const STATUS_TONE: Record<Status, Tone> = {
  neutral: "neutral",
  active: "accent",
  success: "success",
  warning: "warn",
  danger: "danger",
  info: "info",
};

export type StatusBadgeProps = {
  status: Status;
  /** One or two words: "Draft", "Posted", "Running". */
  label: React.ReactNode;
  /** The dot pulses while the status is live (a run in progress). */
  isLive?: boolean;
  title?: string;
  className?: string;
};

export type StatusDotProps = {
  status: Status;
  /** Its name, read and shown on hover: "Pipeline running". */
  label: string;
  isLive?: boolean;
  className?: string;
};

/** A status as a lone dot, where a badge would crowd the row (the MR list's pipeline). */
export const StatusDot = ({
  status,
  label,
  isLive = false,
  className,
}: StatusDotProps): React.ReactElement => (
  <span
    role="img"
    aria-label={label}
    title={label}
    data-tone={toneAttribute(STATUS_TONE[status])}
    className={cn("ui-dot", isLive && "ui-dot--pulse", className)}
  />
);

/** The state of a thing (an MR, a run, an iteration) as a dotted badge. */
export const StatusBadge = ({
  status,
  label,
  isLive = false,
  title,
  className,
}: StatusBadgeProps): React.ReactElement => (
  <Badge
    tone={STATUS_TONE[status]}
    hasDot
    isDotPulsing={isLive}
    {...(title === undefined ? {} : { title })}
    {...(className === undefined ? {} : { className })}
  >
    {label}
  </Badge>
);
