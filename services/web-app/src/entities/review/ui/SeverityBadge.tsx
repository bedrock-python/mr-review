import { Badge } from "@shared/ui";
import type { CommentSeverity } from "../model";

export type SeverityBadgeProps = {
  severity: CommentSeverity;
  variant?: "soft" | "outline";
  className?: string;
};

/** A comment's severity: dot and name in its colour, 12% tint, 40% border. */
export const SeverityBadge = ({
  severity,
  variant = "soft",
  className,
}: SeverityBadgeProps): React.ReactElement => (
  <Badge
    tone={severity}
    variant={variant}
    hasDot
    {...(className === undefined ? {} : { className })}
  >
    {severity}
  </Badge>
);
