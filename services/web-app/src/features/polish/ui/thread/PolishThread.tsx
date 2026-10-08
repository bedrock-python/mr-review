import { useId, useMemo } from "react";
import { Check, X } from "lucide-react";
import { SeverityBadge, SeverityCounts } from "@entities/review";
import { cn } from "@shared/lib";
import { Badge, Card, CountBadge, ICON_SIZE, IconButton, Markdown } from "@shared/ui";
import { GENERAL_FILE_KEY, SEV_COLOR, countBySeverity } from "../../lib";
import type { Comment } from "@entities/review";

type ThreadGroup = {
  key: string;
  label: string;
  comments: Comment[];
};

export type PolishThreadProps = {
  comments: Comment[];
  onToggleStatus: (id: string) => void;
};

type ThreadCommentProps = {
  comment: Comment;
  hasNext: boolean;
  onToggleStatus: (id: string) => void;
};

const ThreadComment = ({
  comment,
  hasNext,
  onToggleStatus,
}: ThreadCommentProps): React.ReactElement => {
  const isDismissed = comment.status === "dismissed";
  return (
    <li className={cn("flex gap-(--space-3)", isDismissed && "opacity-45")}>
      {/* The spine: a dot in the severity's colour, a line down to the next comment's dot. */}
      <div className="flex flex-col items-center pt-(--space-3)" aria-hidden="true">
        <span
          className="size-(--space-2) shrink-0 rounded-full"
          style={{ background: SEV_COLOR[comment.severity] }}
        />
        {hasNext && (
          <span className="bg-border-strong mt-(--space-2) -mb-(--space-2) w-px flex-1" />
        )}
      </div>
      <Card
        padding="sm"
        className={cn("flex min-w-0 flex-1 flex-col gap-(--space-2)", hasNext && "mb-(--space-3)")}
      >
        <div className="flex min-h-(--control-sm) items-center gap-(--space-2)">
          <SeverityBadge severity={comment.severity} />
          {comment.line !== null && (
            <span className="text-fg-2 font-mono text-(length:--fs-meta)">line {comment.line}</span>
          )}
          {isDismissed && <Badge>dismissed</Badge>}
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
              onToggleStatus(comment.id);
            }}
          />
        </div>
        <Markdown className="[&>:last-child]:mb-0!">{comment.body}</Markdown>
      </Card>
    </li>
  );
};

type ThreadFileProps = {
  group: ThreadGroup;
  onToggleStatus: (id: string) => void;
};

const ThreadFile = ({ group, onToggleStatus }: ThreadFileProps): React.ReactElement => {
  const headingId = useId();
  const counts = useMemo(() => countBySeverity(group.comments), [group.comments]);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-(--space-2)">
      <header className="flex min-w-0 items-center gap-(--space-2)">
        <h3
          id={headingId}
          className="text-fg-0 min-w-0 truncate font-mono text-(length:--fs-meta) font-medium"
          title={group.label}
        >
          {group.label}
        </h3>
        <CountBadge count={group.comments.length} />
        <SeverityCounts counts={counts} isCompact />
      </header>
      <ol className="m-0 list-none p-0">
        {group.comments.map((comment, index) => (
          <ThreadComment
            key={comment.id}
            comment={comment}
            hasNext={index < group.comments.length - 1}
            onToggleStatus={onToggleStatus}
          />
        ))}
      </ol>
    </section>
  );
};

/** The comments as they will read on the merge request: one thread per file. */
export const PolishThread = ({
  comments,
  onToggleStatus,
}: PolishThreadProps): React.ReactElement => {
  const groups = useMemo((): ThreadGroup[] => {
    const map = new Map<string, Comment[]>();
    for (const c of comments) {
      const key = c.file ?? GENERAL_FILE_KEY;
      const existing = map.get(key);
      if (existing) {
        existing.push(c);
      } else {
        map.set(key, [c]);
      }
    }
    return Array.from(map.entries()).map(([key, groupComments]) => ({
      key,
      label: key === GENERAL_FILE_KEY ? "General notes" : key,
      comments: groupComments,
    }));
  }, [comments]);

  return (
    <div className="h-full overflow-auto px-(--space-6) py-(--space-5)">
      <div className="mx-auto flex max-w-[720px] flex-col gap-(--space-6)">
        {groups.map((group) => (
          <ThreadFile key={group.key} group={group} onToggleStatus={onToggleStatus} />
        ))}
      </div>
    </div>
  );
};
