import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { SeverityBadge } from "@entities/review";
import { cn } from "@shared/lib";
import { Card, EmptyState, ICON_SIZE, IconButton, Markdown, SectionHeader } from "@shared/ui";
import { SEV_COLOR } from "../../lib";
import { PinnedCommentEditor } from "./PinnedCommentEditor";
import { ReviewDiffViewer } from "./ReviewDiffViewer";
import type { CommentFieldPatch } from "../../model";
import type { Comment } from "@entities/review";

/** The comment pane beside the diff. */
const PANE_WIDTH_PX = 380;

export type PolishPinnedProps = {
  reviewId: string;
  comments: Comment[];
  activeCommentId: string | null;
  setActiveCommentId: (id: string) => void;
  onUpdate: (id: string, patch: CommentFieldPatch) => void;
  onToggleStatus: (id: string) => void;
  isPending: boolean;
};

const lineLabel = (comment: Comment): string =>
  `${comment.file?.split("/").pop() ?? ""}${comment.line !== null ? `:${String(comment.line)}` : ""}`;

type InlineCommentListProps = {
  comments: readonly Comment[];
  onOpen: (id: string) => void;
};

const InlineCommentList = ({ comments, onOpen }: InlineCommentListProps): React.ReactElement => {
  if (comments.length === 0) {
    return <EmptyState size="sm" title="No inline comments" />;
  }
  return (
    <section className="flex flex-col gap-2 p-4">
      <SectionHeader title="Inline comments" count={comments.length} />
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {comments.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => {
                onOpen(c.id);
              }}
              className={cn(
                "flex w-full items-start gap-2 px-2.5 py-2 text-left",
                "border-border bg-bg-1 rounded-(--radius-control) border",
                "hover:border-border-strong hover:bg-bg-hover transition-colors"
              )}
            >
              <span
                className="mt-1 size-2 shrink-0 rounded-full"
                style={{ background: SEV_COLOR[c.severity] }}
                aria-hidden="true"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-fg-2 font-mono text-(length:--fs-meta)">{lineLabel(c)}</span>
                <span className="text-fg-1 truncate text-(length:--fs-control)">{c.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

type GeneralNotesProps = {
  comments: readonly Comment[];
  onToggleStatus: (id: string) => void;
};

const GeneralNotes = ({ comments, onToggleStatus }: GeneralNotesProps): React.ReactElement => (
  <section className="border-border mt-auto flex flex-col gap-2 border-t p-4">
    <SectionHeader title="General notes" count={comments.length} />
    {comments.map((c) => {
      const isDismissed = c.status === "dismissed";
      return (
        <Card
          key={c.id}
          padding="sm"
          className={cn("flex flex-col gap-2", isDismissed && "opacity-45")}
        >
          <div className="flex items-center gap-2">
            <SeverityBadge severity={c.severity} />
            <IconButton
              size="sm"
              className="ml-auto"
              label={isDismissed ? "Keep comment" : "Dismiss comment"}
              icon={
                isDismissed ? (
                  <Check size={ICON_SIZE.inline} aria-hidden="true" />
                ) : (
                  <X size={ICON_SIZE.inline} aria-hidden="true" />
                )
              }
              onClick={() => {
                onToggleStatus(c.id);
              }}
            />
          </div>
          <Markdown className="[&>:last-child]:mb-0!">{c.body}</Markdown>
        </Card>
      );
    })}
  </section>
);

export const PolishPinned = ({
  reviewId,
  comments,
  activeCommentId,
  setActiveCommentId,
  onUpdate,
  onToggleStatus,
  isPending,
}: PolishPinnedProps): React.ReactElement => {
  const inlineComments = comments.filter((c) => c.file !== null && c.status !== "dismissed");
  const generalComments = comments.filter((c) => c.file === null);
  const active = comments.find((c) => c.id === activeCommentId) ?? null;

  // Navigation spans every inline comment, dismissed ones included: dismissing the
  // open comment must not drop it out of the sequence and strand the arrows.
  const navComments = comments.filter((c) => c.file !== null);
  const activeIndex = active === null ? -1 : navComments.findIndex((c) => c.id === active.id);
  const prevComment = activeIndex > 0 ? navComments[activeIndex - 1] : undefined;
  const nextComment = activeIndex >= 0 ? navComments[activeIndex + 1] : undefined;

  // Map new-line → comments for diff markers
  const commentsOnLines = useMemo((): Map<number, Comment[]> => {
    const map = new Map<number, Comment[]>();
    for (const c of comments) {
      if (c.line !== null) {
        const existing = map.get(c.line);
        if (existing) {
          existing.push(c);
        } else {
          map.set(c.line, [c]);
        }
      }
    }
    return map;
  }, [comments]);

  return (
    <div
      className="grid h-full overflow-hidden"
      style={{ gridTemplateColumns: `minmax(0, 1fr) ${String(PANE_WIDTH_PX)}px` }}
    >
      <div className="border-border flex min-w-0 flex-col overflow-hidden border-r">
        {active?.file && (
          <div className="border-border bg-bg-2 text-fg-2 shrink-0 truncate border-b px-3 py-1.5 font-mono text-(length:--fs-meta)">
            {active.file}
            {active.line !== null && `:${String(active.line)}`}
          </div>
        )}
        <ReviewDiffViewer
          reviewId={reviewId}
          targetFile={active?.file ?? null}
          targetLine={active?.line ?? null}
          activeCommentId={activeCommentId}
          commentsOnLines={commentsOnLines}
          onCommentClick={setActiveCommentId}
        />
      </div>

      <div className="flex min-h-0 flex-col overflow-auto">
        {active !== null && active.file !== null ? (
          <PinnedCommentEditor
            // Remount per comment: body/severity live in local state, so without a
            // fresh instance the editor keeps showing (and saving) the previous one.
            key={active.id}
            comment={active}
            onPrev={() => {
              if (prevComment) setActiveCommentId(prevComment.id);
            }}
            onNext={() => {
              if (nextComment) setActiveCommentId(nextComment.id);
            }}
            canGoPrev={prevComment !== undefined}
            canGoNext={nextComment !== undefined}
            position={activeIndex}
            total={navComments.length}
            onUpdate={onUpdate}
            onToggleStatus={onToggleStatus}
            isPending={isPending}
          />
        ) : (
          <InlineCommentList comments={inlineComments} onOpen={setActiveCommentId} />
        )}

        {generalComments.length > 0 && (
          <GeneralNotes comments={generalComments} onToggleStatus={onToggleStatus} />
        )}
      </div>
    </div>
  );
};
