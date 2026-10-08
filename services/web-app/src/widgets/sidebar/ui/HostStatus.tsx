import { cn } from "@shared/lib";
import type { HostConnection } from "../lib/hostConnection";

const LOOK: Record<HostConnection, { label: string; dot: string }> = {
  connecting: { label: "connecting…", dot: "var(--fg-3)" },
  connected: { label: "connected", dot: "var(--c-success)" },
  unreachable: { label: "can't reach host", dot: "var(--c-danger)" },
};

export type HostStatusProps = {
  connection: HostConnection;
  /** The request's error, shown on hover when the host cannot be reached. */
  errorMessage?: string | undefined;
};

/** The host's state at the foot of the repositories pane. */
export const HostStatus = ({ connection, errorMessage }: HostStatusProps): React.ReactElement => {
  const look = LOOK[connection];
  return (
    <span
      title={connection === "unreachable" ? errorMessage : undefined}
      className={cn(
        "flex items-center gap-(--space-2) text-(length:--fs-meta) whitespace-nowrap",
        connection === "unreachable" ? "text-(--c-danger-fg)" : "text-fg-2"
      )}
    >
      <span
        aria-hidden="true"
        className="size-(--dot-size) shrink-0 rounded-full"
        style={{ background: look.dot }}
      />
      <span>{look.label}</span>
    </span>
  );
};
