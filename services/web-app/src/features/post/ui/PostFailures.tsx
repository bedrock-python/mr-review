import { useId } from "react";
import { Ban, CircleQuestionMark, CircleX, MapPinOff } from "lucide-react";
import { Card, ConfirmDialog, ICON_SIZE, SectionHeader } from "@shared/ui";
import { MONO_META, SECTION } from "./postStyles";
import type { Comment, PostFailureKind } from "@entities/review";
import type { LucideIcon } from "lucide-react";

type KindLook = { label: string; tone: "danger" | "warn"; Icon: LucideIcon };

const FAILURE_KIND_LOOK: Record<PostFailureKind, KindLook> = {
  position_rejected: { label: "Not anchored", tone: "danger", Icon: MapPinOff },
  rejected: { label: "Refused", tone: "danger", Icon: CircleX },
  ambiguous: { label: "May already be on the MR", tone: "warn", Icon: CircleQuestionMark },
  blocked: { label: "Blocked", tone: "warn", Icon: Ban },
};

const ROW: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
  padding: "var(--space-2) var(--space-3)",
  fontSize: "var(--fs-control)",
};

// Under the kind, past its icon.
const DETAIL: React.CSSProperties = {
  margin: 0,
  paddingLeft: "calc(var(--icon-inline) + var(--space-2))",
  lineHeight: "var(--lh-body)",
  overflowWrap: "anywhere",
};

const location = (c: Comment): string =>
  c.file === null ? "General note" : `${c.file}${c.line !== null ? `:${String(c.line)}` : ""}`;

/** Each failed comment with what kind of failure it was and the host's reason. */
export const FailedCommentList = ({ comments }: { comments: Comment[] }): React.ReactElement => {
  const titleId = useId();
  return (
    <section style={SECTION}>
      <SectionHeader
        id={titleId}
        title="Failed comments"
        count={comments.length}
        countLabel={`${String(comments.length)} failed`}
      />
      <Card padding="none">
        <ul aria-labelledby={titleId} style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {comments.map((c, index) => {
            const look = FAILURE_KIND_LOOK[c.post?.failure_kind ?? "rejected"];
            return (
              <li
                key={c.id}
                style={{ ...ROW, borderTop: index > 0 ? "1px solid var(--border)" : undefined }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    fontWeight: "var(--fw-semibold)",
                    color: `var(--c-${look.tone}-fg)`,
                  }}
                >
                  <look.Icon size={ICON_SIZE.inline} aria-hidden="true" style={{ flexShrink: 0 }} />
                  <span>{look.label}</span>
                </div>
                <p style={{ ...DETAIL, ...MONO_META }}>{location(c)}</p>
                <p style={{ ...DETAIL, color: "var(--fg-1)" }}>{c.post?.reason ?? "Failed"}</p>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
};

export type ResendConfirmProps = {
  isOpen: boolean;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Asked before comments that may already be on the MR are sent again. Cancel has the focus. */
export const ResendConfirm = ({
  isOpen,
  count,
  onConfirm,
  onCancel,
}: ResendConfirmProps): React.ReactElement => {
  const them = count === 1 ? "it" : "them";
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onCancel={onCancel}
      onConfirm={onConfirm}
      tone="primary"
      title={`Send ${them} again?`}
      description={`${count === 1 ? "1 comment" : `${String(count)} comments`} may already be on the MR: the host did not answer in time. Check the MR first — posting ${them} again can duplicate ${them}.`}
      confirmLabel={`Post ${them} again`}
    />
  );
};
