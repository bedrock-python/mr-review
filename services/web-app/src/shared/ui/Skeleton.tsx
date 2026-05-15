import { cn } from "@shared/lib";

export type SkeletonProps = {
  className?: string;
  style?: React.CSSProperties;
};

export const Skeleton = ({ className, style }: SkeletonProps): React.ReactElement => (
  <div
    aria-hidden="true"
    className={cn("animate-pulse rounded bg-[var(--bg-3)]", className)}
    style={style}
  />
);
