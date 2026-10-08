import type { Comment, CommentPost } from "@entities/review";

export type PostPreviewMode = "json" | "dryrun" | "status";

const OUTCOME_TEXT: Record<CommentPost["outcome"], string> = {
  inline: "posted inline",
  general_note: "posted as general note",
  failed: "failed",
};

const PostStatus = ({ post }: { post: CommentPost | null | undefined }): React.ReactElement => {
  if (post === null || post === undefined) {
    return <span style={{ fontSize: 10, color: "var(--fg-2)", marginLeft: "auto" }}>not sent</span>;
  }
  const color = post.outcome === "failed" ? "var(--c-critical)" : "var(--c-add)";
  return (
    <span style={{ fontSize: 10, color, marginLeft: "auto", whiteSpace: "nowrap" }}>
      {post.url !== null ? (
        <a href={post.url} target="_blank" rel="noopener noreferrer" style={{ color }}>
          {OUTCOME_TEXT[post.outcome]} ↗
        </a>
      ) : (
        OUTCOME_TEXT[post.outcome]
      )}
    </span>
  );
};

const CommentCard = ({
  comment,
  index,
  isStatusShown,
}: {
  comment: Comment;
  index: number;
  isStatusShown: boolean;
}): React.ReactElement => (
  <div
    style={{
      margin: "0 12px 8px",
      padding: "10px 12px",
      background: "var(--bg-0)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-3)",
      fontSize: 12,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-2)" }}>
        #{index + 1}
      </span>
      <span className={`sev ${comment.severity}`}>
        <span className="dot" />
        {comment.severity}
      </span>
      {comment.file !== null ? (
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--fg-2)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {comment.file}
          {comment.line !== null ? `:${String(comment.line)}` : ""}
        </span>
      ) : (
        <span style={{ fontSize: 10, color: "var(--fg-2)" }}>general note</span>
      )}
      {isStatusShown && <PostStatus post={comment.post} />}
    </div>
    <div style={{ color: "var(--fg-1)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
      {comment.body}
    </div>
  </div>
);

const HEADER_TEXT: Record<PostPreviewMode, string> = {
  json: "review.json",
  dryrun: "dry-run · no changes will be made",
  status: "on the MR",
};

/** The right-hand column: the payload as JSON, a dry run, or each comment with what became of it. */
export const PostPreview = ({
  mode,
  comments,
  json,
}: {
  mode: PostPreviewMode;
  comments: Comment[];
  json: string;
}): React.ReactElement => (
  <div
    style={{ display: "flex", flexDirection: "column", background: "var(--bg-1)", minHeight: 0 }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      <span className="mono" style={{ fontSize: 11, color: "var(--fg-2)" }}>
        {HEADER_TEXT[mode]}
      </span>
      <span className="chip" style={{ fontSize: 10 }}>
        {comments.length} {comments.length === 1 ? "comment" : "comments"}
      </span>
    </div>

    {mode === "json" ? (
      <pre
        style={{
          flex: 1,
          margin: 0,
          padding: "14px 18px",
          overflow: "auto",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          lineHeight: 1.5,
          color: "var(--fg-1)",
          whiteSpace: "pre",
          background: "var(--bg-0)",
        }}
      >
        {json}
      </pre>
    ) : (
      <div style={{ flex: 1, overflow: "auto", padding: "12px 0" }}>
        {comments.length === 0 ? (
          <div style={{ padding: "20px 18px", fontSize: 12.5, color: "var(--fg-2)" }}>
            No comments to preview.
          </div>
        ) : (
          comments.map((c, i) => (
            <CommentCard key={c.id} comment={c} index={i} isStatusShown={mode === "status"} />
          ))
        )}
      </div>
    )}
  </div>
);
