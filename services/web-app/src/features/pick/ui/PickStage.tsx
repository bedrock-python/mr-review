import { useState } from "react";
import { FileDiff } from "lucide-react";
import { useNav } from "@app/navigation";
import { useStageNavigation } from "@widgets/stage-bar";
import { useMR, useDiff, getDiffStats, sumDiffStats } from "@entities/mr";
import { EmptyState, ErrorState, ICON_SIZE, StageLoading } from "@shared/ui";
import { DiffViewer } from "./DiffViewer";
import { FileList } from "./FileList";
import { MRSidebar } from "./MRSidebar";
import { PICK_LAYOUT } from "./PICK_LAYOUT";

const PickWorkspace = (): React.ReactElement => {
  const { selectedHostId, selectedRepoPath, selectedMRIid } = useNav();
  const { goToStage, isPending } = useStageNavigation();
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  const mrQuery = useMR(selectedHostId, selectedRepoPath, selectedMRIid);
  const diffQuery = useDiff(selectedHostId, selectedRepoPath, selectedMRIid);
  const mr = mrQuery.data;
  const diff = diffQuery.data;

  const activeFile = diff?.find((f) => f.path === selectedFilePath) ?? diff?.[0] ?? null;
  // Some hosts (GitLab) never report MR-level stats; the loaded diff has them.
  const diffStats = (mr ? getDiffStats(mr) : null) ?? (diff ? sumDiffStats(diff) : null);

  // Creates the review and its iteration when needed, and starts a new round on a review
  // whose last iteration was already posted.
  const handleCompose = (): void => {
    void goToStage("brief");
  };

  if (mrQuery.isLoading || diffQuery.isLoading) {
    return <StageLoading label="Loading merge request…" />;
  }

  if (mrQuery.isError || diffQuery.isError) {
    return (
      <ErrorState
        isFill
        title="Could not load the merge request"
        message="The host did not return its details or its diff."
        onRetry={() => {
          void mrQuery.refetch();
          void diffQuery.refetch();
        }}
      />
    );
  }

  return (
    <div
      className="grid h-full overflow-hidden"
      style={{
        gridTemplateColumns: `${String(PICK_LAYOUT.filesWidthPx)}px 1fr ${String(PICK_LAYOUT.sidebarWidthPx)}px`,
      }}
    >
      <FileList
        files={diff ?? []}
        selectedPath={activeFile?.path ?? null}
        onSelect={setSelectedFilePath}
      />

      {/* The diff scrolls its own rows, so it can render only the visible ones. */}
      <div className="min-h-0 min-w-0 overflow-hidden">
        {activeFile ? (
          <DiffViewer file={activeFile} />
        ) : (
          <EmptyState
            isFill
            icon={<FileDiff size={ICON_SIZE.button} />}
            title="No changes in this MR"
            description="The merge request has no changed files to review."
          />
        )}
      </div>

      {mr && (
        <MRSidebar
          mr={mr}
          diffStats={diffStats}
          fileCount={diff?.length ?? mr.file_count}
          onCompose={handleCompose}
          isComposing={isPending}
        />
      )}
    </div>
  );
};

/**
 * The file tree keeps its expanded folders, filter and selection per merge request: a new
 * one starts from its own files, not from the previous merge request's view.
 */
export const PickStage = (): React.ReactElement => {
  const { selectedHostId, selectedRepoPath, selectedMRIid } = useNav();
  return <PickWorkspace key={[selectedHostId, selectedRepoPath, selectedMRIid].join("|")} />;
};
