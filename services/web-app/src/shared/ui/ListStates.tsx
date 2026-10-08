export type ListMessageProps = {
  children: React.ReactNode;
  /** Optional call to action rendered under the message (e.g. "Retry"). */
  actionLabel?: string;
  onAction?: () => void;
  isError?: boolean;
};

const inlineActionStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 5,
  padding: "3px 10px",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "var(--fg-1)",
  cursor: "pointer",
};

/** Centered placeholder for empty, hint and first-page error states of a list. */
export const ListMessage = ({
  children,
  actionLabel,
  onAction,
  isError = false,
}: ListMessageProps): React.ReactElement => (
  <div
    role={isError ? "alert" : "status"}
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      minHeight: 80,
      color: "var(--fg-2)",
      fontSize: 12,
      textAlign: "center",
      padding: "16px 20px",
    }}
  >
    <span>{children}</span>
    {actionLabel && onAction && (
      <button type="button" onClick={onAction} style={inlineActionStyle}>
        {actionLabel}
      </button>
    )}
  </div>
);

export type LoadMoreRowProps =
  | { state: "loading" }
  | { state: "error"; message: string; onRetry: () => void }
  | { state: "paused"; message: string; onLoadMore: () => void };

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 12px",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "var(--fg-2)",
};

const SmallSpinner = (): React.ReactElement => (
  <span
    aria-hidden="true"
    style={{
      width: 10,
      height: 10,
      borderRadius: "50%",
      border: "1.5px solid var(--fg-3)",
      borderTopColor: "transparent",
      animation: "spin 0.6s linear infinite",
      flexShrink: 0,
    }}
  />
);

/** Tail row of an infinite list: next page in flight, failed, or paused. */
export const LoadMoreRow = (props: LoadMoreRowProps): React.ReactElement => {
  if (props.state === "loading") {
    return (
      <div role="status" style={rowStyle}>
        <SmallSpinner />
        Loading more…
      </div>
    );
  }
  if (props.state === "error") {
    return (
      <div role="alert" style={{ ...rowStyle, color: "var(--c-critical)" }}>
        <span>{props.message}</span>
        <button type="button" onClick={props.onRetry} style={inlineActionStyle}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <div style={rowStyle}>
      <span>{props.message}</span>
      <button type="button" onClick={props.onLoadMore} style={inlineActionStyle}>
        Load more
      </button>
    </div>
  );
};

export type ListStatusBarProps = {
  loadedCount: number;
  /** Rows left after client-side filtering; omitted when nothing is hidden. */
  shownCount?: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
};

const formatListStatus = ({
  loadedCount,
  shownCount,
  hasNextPage,
  isFetchingNextPage,
}: ListStatusBarProps): string => {
  const parts: string[] = [];
  if (shownCount !== undefined && shownCount !== loadedCount) {
    parts.push(`${String(shownCount)} shown`);
  }
  parts.push(`${String(loadedCount)} loaded`);
  if (isFetchingNextPage) parts.push("loading more…");
  else if (hasNextPage) parts.push("more available");
  else parts.push("all loaded");
  return parts.join(" · ");
};

/** One-line summary of how much of a paginated list is on the client. */
export const ListStatusBar = (props: ListStatusBarProps): React.ReactElement => (
  <div
    className="mono"
    aria-live="polite"
    style={{
      flexShrink: 0,
      borderTop: "1px solid var(--border)",
      padding: "4px 14px",
      fontSize: 10,
      color: "var(--fg-2)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}
  >
    {formatListStatus(props)}
  </div>
);
