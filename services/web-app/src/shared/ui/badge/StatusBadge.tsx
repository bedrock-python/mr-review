import { Badge } from "./Badge";
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
