import { ExternalLink } from "lucide-react";
import { SeverityBadge } from "@entities/review";
import { ICON_SIZE, Markdown, StatusBadge } from "@shared/ui";
import { toPlainText } from "../lib/plainText";
import { MONO_META } from "./postStyles";
import type { Comment, CommentPost } from "@entities/review";
import type { Status } from "@shared/ui";

type Outcome = { status: Status; label: string };

/** What became of one comment, as a badge. */
const outcomeOf = (post: CommentPost | null | undefined, isCompleted: boolean): Outcome => {
  if (post === null || post === undefined) {
    // In a completed iteration such a comment was posted before records were kept.
    return { status: "neutral", label: isCompleted ? "no details" : "not sent" };
  }
  if (post.outcome === "inline") return { status: "success", label: "posted inline" };
  if (post.outcome === "general_note") return { status: "success", label: "general note" };
  if (post.failure_kind === "ambiguous") return { status: "warning", label: "unconfirmed" };
  return { status: "danger", label: "failed" };
};

const ROW: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  minWidth: 0,
  padding: "var(--space-3) var(--space-4)",
  borderTop: "1px solid var(--border)",
};

// Two lines of the body: enough to tell the comments apart in a report.
const EXCERPT: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  margin: 0,
  fontSize: "var(--fs-control)",
  lineHeight: "var(--lh-body)",
  color: "var(--fg-1)",
  overflowWrap: "anywhere",
};

export type PostCommentRowProps = {
  comment: Comment;
  /** Show what became of it, with the body cut to two lines. */
  isStatusShown: boolean;
  isCompleted: boolean;
};

/** One comment as it goes to the MR: severity, line and body, and later what became of it. */
export const PostCommentRow = ({
  comment,
  isStatusShown,
  isCompleted,
}: PostCommentRowProps): React.ReactElement => {
  const outcome = outcomeOf(comment.post, isCompleted);
  const url = comment.post?.url ?? null;
  return (
    <li style={ROW}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <SeverityBadge severity={comment.severity} />
        {comment.line !== null && <span style={MONO_META}>line {comment.line}</span>}
        {isStatusShown && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              marginLeft: "auto",
            }}
          >
            <StatusBadge status={outcome.status} label={outcome.label} />
            {url !== null && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open on the MR"
                title="Open on the MR"
                style={{ display: "inline-flex", color: "var(--fg-2)" }}
              >
                <ExternalLink size={ICON_SIZE.inline} aria-hidden="true" />
              </a>
            )}
          </span>
        )}
      </div>
      {isStatusShown ? (
        <p style={EXCERPT}>{toPlainText(comment.body)}</p>
      ) : (
        <Markdown>{comment.body}</Markdown>
      )}
    </li>
  );
};
