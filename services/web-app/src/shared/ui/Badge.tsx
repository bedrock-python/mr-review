import { cn } from "@shared/lib";

export type Severity = "critical" | "major" | "minor" | "suggestion";

export type BadgeProps = {
  severity: Severity;
  className?: string;
};

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "CRITICAL",
  major: "MAJOR",
  minor: "MINOR",
  suggestion: "SUGGESTION",
};

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "bg-[var(--severity-critical)] text-bg",
  major: "bg-[var(--severity-major)] text-bg",
  minor: "bg-[var(--severity-minor)] text-bg",
  suggestion: "bg-[var(--severity-suggestion)] text-bg",
};

export const Badge = ({ severity, className }: BadgeProps): React.ReactElement => {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider",
        SEVERITY_STYLES[severity],
        className
      )}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
};
