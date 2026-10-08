import { cn } from "@shared/lib";

export type SkeletonRadius = "badge" | "control" | "card" | "pill" | "circle";

export type SkeletonProps = {
  width?: number | string;
  height?: number | string;
  /** Corner radius from the scale; "circle" for avatars. */
  radius?: SkeletonRadius;
  className?: string;
  /** Wins over width/height/radius, for margins and one-off sizes. */
  style?: React.CSSProperties;
};

const RADIUS: Record<SkeletonRadius, string> = {
  badge: "var(--radius-badge)",
  control: "var(--radius-control)",
  card: "var(--radius-card)",
  pill: "var(--radius-pill)",
  circle: "50%",
};

/**
 * A placeholder block that pulses while content loads. Hidden from assistive tech: the
 * region that loads says so itself (aria-busy, or a status with a label).
 */
export const Skeleton = ({
  width,
  height,
  radius = "badge",
  className,
  style,
}: SkeletonProps): React.ReactElement => (
  <span
    aria-hidden="true"
    className={cn("ui-skeleton", className)}
    style={{ width, height, borderRadius: RADIUS[radius], ...style }}
  />
);
