import { useState } from "react";
import { useAppStore } from "@app/providers";
import { useStageBarStore } from "@widgets/stage-bar";
import { useMR, useDiff } from "@entities/mr";
import { useCreateReview } from "@entities/review";
import type { Review } from "@entities/review";
import { Spinner } from "@shared/ui";
import { cn } from "@shared/lib";
import { DiffViewer } from "./DiffViewer";
import { MRMeta } from "./MRMeta";
import { FileList } from "./FileList";

const LoadingState = (): React.ReactElement => (
  <div className="flex items-center justify-center h-full gap-3 text-[var(--text-muted)]">
    <Spinner size="md" />
    <span className="text-sm">Loading merge request…</span>
  </div>
);

const ErrorState = (): React.ReactElement => (
  <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--text-muted)]">
    <span className="text-2xl">⚠</span>
    <p className="text-sm">Failed to load merge request data.</p>
  </div>
);

export const PickStage = (): React.ReactElement => {
  const { selectedHostId, selectedRepoPath, selectedMRIid, activeReviewId, setReview } =
    useAppStore();
  const setStage = useStageBarStore((s) => s.setStage);
  const createReview = useCreateReview();
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  const {
    data: mr,
    isLoading: mrLoading,
    isError: mrError,
  } = useMR(selectedHostId, selectedRepoPath, selectedMRIid);

  const {
    data: diff,
    isLoading: diffLoading,
    isError: diffError,
  } = useDiff(selectedHostId, selectedRepoPath, selectedMRIid);

  const isLoading = mrLoading || diffLoading;
  const isError = mrError || diffError;

  // Auto-select first file when diff loads; respect manual selection otherwise
  const activeFile = diff?.find((f) => f.path === selectedFilePath) ?? diff?.[0] ?? null;

  const handleStartReview = (): void => {
    // If a review already exists for this MR, just advance to brief
    if (activeReviewId) {
      setStage("brief");
      return;
    }
    if (!selectedHostId || !selectedRepoPath || selectedMRIid === null) return;
    createReview.mutate(
      { host_id: selectedHostId, repo_path: selectedRepoPath, mr_iid: selectedMRIid },
      {
        onSuccess: (review) => {
          setReview((review as Review).id);
          setStage("brief");
        },
      },
    );
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState />;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Left: file tabs + diff viewer */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-[var(--border)]">
          <FileList
            files={diff ?? []}
            selectedPath={activeFile?.path ?? null}
            onSelect={setSelectedFilePath}
          />
          <div className="flex-1 overflow-auto">
            {activeFile ? (
              <DiffViewer file={activeFile} />
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
                No changes in this MR
              </div>
            )}
          </div>
        </div>

        {/* Right: MR metadata */}
        <aside className="w-80 flex-shrink-0 overflow-y-auto bg-[var(--surface)]">
          {mr && <MRMeta mr={mr} totalFiles={diff?.length ?? 0} />}
        </aside>
      </div>

      {/* Bottom action bar */}
      <div className="border-t border-border bg-surface px-6 py-3 flex justify-end flex-shrink-0">
        <button
          type="button"
          onClick={handleStartReview}
          disabled={createReview.isPending || !selectedMRIid}
          className={cn(
            "px-6 py-2.5 rounded-lg text-sm font-semibold transition-all",
            "bg-[var(--accent)] text-[rgb(var(--accent-fg))]",
            "hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed",
            "flex items-center gap-2",
          )}
        >
          {createReview.isPending && <Spinner size="sm" />}
          Start Review →
        </button>
      </div>
    </div>
  );
};
