import { cn } from "@shared/lib";

export type SpinnerProps = {
  className?: string;
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-12 w-12 border-4",
};

export const Spinner = ({ className, fullScreen = false, size = "md" }: SpinnerProps) => {
  const spinner = (
    <div
      className={cn(
        "border-primary animate-spin rounded-full border-solid border-t-transparent",
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );

  if (fullScreen) {
    return <div className="flex h-screen w-screen items-center justify-center">{spinner}</div>;
  }

  return spinner;
};
