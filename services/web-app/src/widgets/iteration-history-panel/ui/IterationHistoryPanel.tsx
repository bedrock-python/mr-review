import { History } from "lucide-react";
import { useAppStore } from "@app/store";
import { useNav } from "@app/navigation";
import { useReview } from "@entities/review";
import { CountBadge, Drawer, EmptyState, ErrorState, ICON_SIZE, Skeleton } from "@shared/ui";
import { IterationRow } from "./IterationRow";
import type { IterationStage } from "@entities/review";

const SKELETON_ROWS = 3;

const SKELETON_ROW: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  padding: "var(--space-3) var(--space-4)",
  borderBottom: "1px solid var(--border)",
};

const IterationSkeleton = (): React.ReactElement => (
  <div role="status" aria-busy="true">
    <span className="ui-visually-hidden">Loading iterations…</span>
    {Array.from({ length: SKELETON_ROWS }, (_, index) => (
      <div key={index} style={SKELETON_ROW}>
        <Skeleton width="40%" height="var(--fs-body)" />
        <Skeleton width="55%" height="var(--fs-meta)" />
        <Skeleton width="35%" height="var(--space-4)" />
      </div>
    ))}
  </div>
);

export type IterationHistoryPanelProps = {
  activeIterationId: string | null;
  onIterationSelect: (iterationId: string, stage: IterationStage) => void;
};

/** Mounted only while the panel is open. */
const IterationList = ({
  activeIterationId,
  onIterationSelect,
}: IterationHistoryPanelProps): React.ReactElement => {
  const { activeReviewId } = useNav();
  const reviewQuery = useReview(activeReviewId);
  const iterations = reviewQuery.data?.iterations ?? [];
  const latestId = iterations.at(-1)?.id ?? null;

  if (activeReviewId !== null && reviewQuery.isPending) return <IterationSkeleton />;
  if (reviewQuery.isError) {
    return (
      <ErrorState
        size="sm"
        title="Could not load the iterations"
        message={reviewQuery.error.message}
        onRetry={() => {
          void reviewQuery.refetch();
        }}
      />
    );
  }
  if (iterations.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={<History size={ICON_SIZE.inline} />}
        title="No iterations yet"
        description="Each brief you dispatch starts one."
      />
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      {[...iterations].reverse().map((iteration) => (
        <IterationRow
          key={iteration.id}
          iteration={iteration}
          isActive={iteration.id === activeIterationId}
          isLatest={iteration.id === latestId}
          onClick={() => {
            onIterationSelect(iteration.id, iteration.stage);
          }}
        />
      ))}
    </div>
  );
};

const IterationCount = (): React.ReactElement | null => {
  const { activeReviewId } = useNav();
  const { data: review } = useReview(activeReviewId);
  const count = review?.iterations.length ?? 0;
  if (count === 0) return null;
  return (
    <CountBadge
      count={count}
      label={`${String(count)} ${count === 1 ? "iteration" : "iterations"}`}
    />
  );
};

/** The rounds of the open review, newest first; picking one shows it in its stage. */
export const IterationHistoryPanel = ({
  activeIterationId,
  onIterationSelect,
}: IterationHistoryPanelProps): React.ReactElement => {
  const isOpen = useAppStore((s) => s.iterationHistoryOpen);
  const setIterationHistoryOpen = useAppStore((s) => s.setIterationHistoryOpen);

  const handleClose = (): void => {
    setIterationHistoryOpen(false);
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={handleClose}
      title="Iterations"
      headerExtra={<IterationCount />}
    >
      <IterationList
        activeIterationId={activeIterationId}
        onIterationSelect={(id, stage) => {
          onIterationSelect(id, stage);
          handleClose();
        }}
      />
    </Drawer>
  );
};
