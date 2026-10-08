import type { HostConnection } from "../lib/hostConnection";

const LOOK: Record<HostConnection, { label: string; dot: string }> = {
  connecting: { label: "connecting…", dot: "var(--fg-3)" },
  connected: { label: "connected", dot: "var(--c-add)" },
  unreachable: { label: "can't reach host", dot: "var(--c-critical)" },
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
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
        fontSize: 11,
        color: connection === "unreachable" ? "var(--c-critical-fg)" : "var(--fg-2)",
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: "50%", background: look.dot, flexShrink: 0 }}
      />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {look.label}
      </span>
    </span>
  );
};
