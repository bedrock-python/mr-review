import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { Card, ICON_SIZE, StatusBadge } from "@shared/ui";
import { formatPostedAt } from "../lib/postSummary";
import { FailedCommentList } from "./PostFailures";
import { PostOptions } from "./PostParts";
import { ASIDE, STAGE_SUBTITLE, STAGE_TITLE } from "./postStyles";
import type { PostState, PostSummary } from "../lib/postSummary";
import type { PostOptionsProps } from "./PostParts";
import type { Status } from "@shared/ui";
import type { LucideIcon } from "lucide-react";

type AttemptedState = Exclude<PostState, "ready">;

const STATE_LOOK: Record<AttemptedState, { title: string; color: string; Icon: LucideIcon }> = {
  posted: { title: "Posted to", color: "var(--c-success-fg)", Icon: CircleCheck },
  partial: { title: "Partly posted to", color: "var(--c-warn-fg)", Icon: TriangleAlert },
  failed: { title: "Nothing was posted to", color: "var(--c-danger-fg)", Icon: CircleX },
};

/** What the subtitle says: when it was posted, or how much of it is on the MR. */
const describeProgress = (summary: PostSummary): string => {
  const landed = summary.inline + summary.generalNotes;
  const at = summary.postedAt !== null ? formatPostedAt(summary.postedAt) : null;
  if (summary.state === "posted")
    return at !== null ? `Posted at ${at}` : "Every comment is on the MR.";
  const progress = `${String(landed)} of ${String(summary.kept.length)} comments are on the MR.`;
  return at !== null && landed > 0 ? `${progress} Last posted at ${at}.` : progress;
};

type Tile = { label: string; value: number; status: Status };

const tilesOf = (summary: PostSummary): Tile[] => {
  const failed = summary.failed.length;
  return [
    { label: "Inline", value: summary.inline, status: summary.inline > 0 ? "success" : "neutral" },
    {
      label: "General",
      value: summary.generalNotes,
      status: summary.generalNotes > 0 ? "success" : "neutral",
    },
    { label: "Failed", value: failed, status: failed > 0 ? "danger" : "neutral" },
    ...(summary.unsent > 0
      ? [{ label: "Not sent", value: summary.unsent, status: "neutral" as const }]
      : []),
    ...(summary.unrecorded > 0
      ? [{ label: "No details", value: summary.unrecorded, status: "neutral" as const }]
      : []),
  ];
};

const DANGER_TILE: React.CSSProperties = {
  borderColor: "var(--c-critical-line)",
  background: "var(--c-critical-tint)",
};

const TILE_VALUE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-page)",
  fontWeight: "var(--fw-semibold)",
  lineHeight: "var(--lh-tight)",
  fontVariantNumeric: "tabular-nums",
};

/** One number per outcome; Failed turns red once anything failed. */
const ResultTiles = ({ summary }: { summary: PostSummary }): React.ReactElement => (
  <ul
    aria-label="Post counts"
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "var(--space-2)",
      margin: 0,
      padding: 0,
      listStyle: "none",
    }}
  >
    {tilesOf(summary).map((tile) => (
      <Card
        key={tile.label}
        as="li"
        padding="sm"
        style={tile.status === "danger" ? DANGER_TILE : undefined}
      >
        <div
          style={{
            ...TILE_VALUE,
            color: tile.status === "danger" ? "var(--c-danger-fg)" : "var(--fg-0)",
          }}
        >
          {tile.value}
        </div>
        <StatusBadge status={tile.status} label={tile.label} />
      </Card>
    ))}
  </ul>
);

export type PostResultPanelProps = PostOptionsProps & {
  summary: PostSummary;
  mrLabel: string;
};

/** What the last post did, read from the server: survives a reload. */
export const PostResultPanel = ({
  summary,
  mrLabel,
  ...options
}: PostResultPanelProps): React.ReactElement => {
  const state = summary.state === "ready" ? "failed" : summary.state;
  const look = STATE_LOOK[state];
  const isRetryable = summary.failed.length + summary.unsent > 0;

  return (
    <aside aria-label="Post result" style={ASIDE}>
      <div>
        <h2
          style={{ ...STAGE_TITLE, display: "flex", alignItems: "center", gap: "var(--space-2)" }}
        >
          <look.Icon
            size={ICON_SIZE.button}
            aria-hidden="true"
            style={{ flexShrink: 0, color: look.color }}
          />
          <span>
            {look.title} {mrLabel}
          </span>
        </h2>
        <p style={STAGE_SUBTITLE}>{describeProgress(summary)}</p>
      </div>

      <ResultTiles summary={summary} />

      {summary.failed.length > 0 && <FailedCommentList comments={summary.failed} />}

      {isRetryable && <PostOptions {...options} />}
    </aside>
  );
};
