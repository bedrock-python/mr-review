import { Skeleton } from "@shared/ui";

const ROWS = 5;
// Titles of a few lengths, so the placeholder does not read as a table.
const TITLE_WIDTHS = ["45%", "60%", "35%"] as const;

const ROW: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  padding: "var(--space-3) var(--space-4)",
  borderBottom: "1px solid var(--border)",
};

/** The review rows' shape while the list loads. */
export const HistorySkeleton = (): React.ReactElement => (
  <div role="status" aria-busy="true">
    <span className="ui-visually-hidden">Loading reviews…</span>
    {Array.from({ length: ROWS }, (_, index) => (
      <div key={index} style={ROW}>
        <Skeleton
          width={TITLE_WIDTHS[index % TITLE_WIDTHS.length] ?? TITLE_WIDTHS[0]}
          height="var(--fs-body)"
        />
        <Skeleton width="70%" height="var(--fs-meta)" />
        <Skeleton width="30%" height="var(--space-4)" radius="badge" />
      </div>
    ))}
  </div>
);
