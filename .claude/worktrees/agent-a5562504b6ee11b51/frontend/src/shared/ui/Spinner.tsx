import { cn } from "@shared/lib";

export type SpinnerProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASSES: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-[3px]",
};

export const Spinner = ({ size = "md", className }: SpinnerProps): React.ReactElement => {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "animate-spin rounded-full border-text-muted border-t-transparent",
        SIZE_CLASSES[size],
        className,
      )}
    />
  );
};
