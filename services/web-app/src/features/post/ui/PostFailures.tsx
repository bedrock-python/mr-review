import type { Comment, PostFailureKind } from "@entities/review";

const KIND_LOOK: Record<PostFailureKind, { label: string; color: string }> = {
  position_rejected: { label: "Not anchored", color: "var(--c-critical)" },
  rejected: { label: "Refused", color: "var(--c-critical)" },
  ambiguous: { label: "May already be on the MR", color: "var(--c-minor)" },
  blocked: { label: "Blocked", color: "var(--c-major)" },
};

const location = (c: Comment): string =>
  c.file === null ? "general note" : `${c.file}${c.line !== null ? `:${String(c.line)}` : ""}`;

/** Each failed comment with what kind of failure it was and the host's reason. */
export const FailedCommentList = ({ comments }: { comments: Comment[] }): React.ReactElement => (
  <ul aria-label="Failed comments" style={{ listStyle: "none", margin: "18px 0 0", padding: 0 }}>
    {comments.map((c) => {
      const look = KIND_LOOK[c.post?.failure_kind ?? "rejected"];
      return (
        <li
          key={c.id}
          style={{
            padding: "8px 10px",
            marginBottom: 6,
            background: `color-mix(in oklch, ${look.color} 8%, var(--bg-1))`,
            border: `1px solid color-mix(in oklch, ${look.color} 30%, transparent)`,
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-2)" }}>
              {location(c)}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: look.color }}>{look.label}</span>
          </div>
          <div style={{ color: "var(--fg-1)", marginTop: 2 }}>{c.post?.reason ?? "Failed"}</div>
        </li>
      );
    })}
  </ul>
);

export type ResendConfirmProps = {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Asked before comments that may already be on the MR are sent again. */
export const ResendConfirm = ({
  count,
  onConfirm,
  onCancel,
}: ResendConfirmProps): React.ReactElement => (
  <div
    role="alertdialog"
    aria-label="Post comments that may already be on the MR?"
    style={{
      marginTop: 18,
      padding: "12px 14px",
      background: "color-mix(in oklch, var(--c-minor) 10%, var(--bg-1))",
      border: "1px solid color-mix(in oklch, var(--c-minor) 40%, transparent)",
      borderRadius: 8,
      fontSize: 12.5,
      color: "var(--fg-1)",
    }}
  >
    <div>
      {count === 1 ? "1 comment" : `${String(count)} comments`} may already be on the MR: the host
      did not answer in time. Check the MR first — posting {count === 1 ? "it" : "them"} again can
      duplicate {count === 1 ? "it" : "them"}.
    </div>
    <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className="btn primary" onClick={onConfirm}>
        Post them again
      </button>
    </div>
  </div>
);
