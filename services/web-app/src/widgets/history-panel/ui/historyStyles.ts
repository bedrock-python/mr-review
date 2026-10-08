import type { ReviewStage } from "@entities/review";
import type { Status, Tone } from "@shared/ui";

/** How a review's stage reads in a row (StatusBadge) and in the stage filter (Chip tone). */
export const STAGE_META: Record<ReviewStage, { label: string; status: Status; tone: Tone }> = {
  pick: { label: "Picking", status: "neutral", tone: "neutral" },
  brief: { label: "Brief", status: "neutral", tone: "neutral" },
  dispatch: { label: "Dispatching", status: "info", tone: "info" },
  polish: { label: "Polishing", status: "active", tone: "accent" },
  post: { label: "Posted", status: "success", tone: "success" },
};

/** One review row: open button on the left, delete on the right. */
export const ROW_CLASS =
  "group relative flex items-center border-b border-border hover:bg-bg-hover";

export const ROW_OPEN: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
  flex: 1,
  minWidth: 0,
  padding: "var(--space-3) var(--space-2) var(--space-3) var(--space-4)",
  border: 0,
  background: "none",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
};
