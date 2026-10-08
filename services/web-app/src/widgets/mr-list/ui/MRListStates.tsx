import { GitPullRequest, SearchX } from "lucide-react";
import { Button, Callout, EmptyState, ICON_SIZE, Skeleton } from "@shared/ui";
import type { InboxScope } from "@entities/mr";

const SKELETON_ROWS = 6;
const SKELETON_TITLE_WIDTHS: readonly string[] = ["82%", "64%", "74%"];

/** Rows in the shape of the real ones while the first page loads. */
export const MRListSkeleton = (): React.ReactElement => (
  <div role="status" aria-label="Loading merge requests">
    {Array.from({ length: SKELETON_ROWS }, (_, i) => (
      <div
        key={i}
        className="border-border flex flex-col gap-(--space-2) border-b px-(--space-3) py-(--space-3)"
      >
        <div className="flex items-center justify-between gap-(--space-3)">
          <Skeleton
            width={SKELETON_TITLE_WIDTHS[i % SKELETON_TITLE_WIDTHS.length] ?? "70%"}
            height="var(--fs-body)"
          />
          <Skeleton width="var(--space-5)" height="var(--fs-meta)" />
        </div>
        <Skeleton width="45%" height="var(--fs-meta)" />
      </div>
    ))}
  </div>
);

const EMPTY_INBOX: Record<InboxScope, string> = {
  all: "No open merge requests in your repositories.",
  review_requested: "Nobody has asked for your review.",
  assigned: "Nothing is assigned to you.",
  authored: "You have no open merge requests.",
};

export type EmptyListProps = {
  isFiltered: boolean;
  /** The inbox relationship, or null in a repository. */
  scope: InboxScope | null;
  onClearFilters: () => void;
};

/** An empty list says why: a filter hides everything, or there is nothing at all. */
export const EmptyList = ({
  isFiltered,
  scope,
  onClearFilters,
}: EmptyListProps): React.ReactElement => {
  if (isFiltered) {
    return (
      <EmptyState
        size="sm"
        icon={<SearchX size={ICON_SIZE.inline} />}
        title="No merge requests match"
        description="Nothing loaded matches the search or the filter."
        actions={
          <Button size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      size="sm"
      icon={<GitPullRequest size={ICON_SIZE.inline} />}
      title={scope === null ? "No merge requests here" : "Inbox zero"}
      description={
        scope === null ? "Try another state above, or another repository." : EMPTY_INBOX[scope]
      }
    />
  );
};

export type RefreshErrorNoteProps = { message: string | undefined; onRetry: () => void };

/** A refresh that failed over a loaded list: the list stays, this says it may be old. */
export const RefreshErrorNote = ({
  message,
  onRetry,
}: RefreshErrorNoteProps): React.ReactElement => (
  <Callout
    tone="danger"
    size="sm"
    className="m-(--space-2)"
    actions={
      <Button size="sm" onClick={onRetry}>
        Retry
      </Button>
    }
  >
    Could not refresh the list{message === undefined ? "." : ` — ${message}`}
  </Callout>
);
