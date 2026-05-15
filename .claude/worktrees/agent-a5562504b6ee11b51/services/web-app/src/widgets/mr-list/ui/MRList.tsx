import { useState } from "react";
import { cn } from "@shared/lib";
import { Spinner } from "@shared/ui";
import { useMRs } from "@entities/mr";
import type { MRStatus } from "@entities/mr";
import { useAppStore } from "@app/providers";
import { MRListItem } from "./MRListItem";

const STATUS_TABS: { label: string; value: MRStatus }[] = [
  { label: "Open", value: "opened" },
  { label: "Merged", value: "merged" },
  { label: "Closed", value: "closed" },
];

export const MRList = (): React.ReactElement => {
  const [statusFilter, setStatusFilter] = useState<MRStatus>("opened");
  const { selectedHostId, selectedRepoPath, selectedMRIid, setMR } = useAppStore();

  const { data: mrs, isLoading, isError } = useMRs(
    selectedHostId,
    selectedRepoPath,
    { status: statusFilter },
  );

  return (
    <section
      aria-label="Merge Requests"
      className="flex flex-col w-[360px] h-screen bg-bg border-r border-border flex-shrink-0"
    >
      <div className="px-4 pt-4 pb-0 border-b border-border">
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Merge Requests
        </h2>
        <div className="flex gap-0" role="tablist" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                "flex-1 py-2 text-xs font-medium transition-colors border-b-2",
                statusFilter === tab.value
                  ? "border-[var(--accent)] text-text"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selectedRepoPath && (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted text-xs text-center px-4">
            Select a repository to see merge requests
          </div>
        )}

        {selectedRepoPath && isLoading && (
          <div className="flex justify-center pt-8">
            <Spinner size="md" />
          </div>
        )}

        {selectedRepoPath && isError && (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted text-xs text-center px-4">
            Failed to load merge requests
          </div>
        )}

        {selectedRepoPath && !isLoading && (mrs?.length === 0) && (
          <div className="flex flex-col items-center justify-center h-32 text-text-muted text-xs text-center px-4">
            No {statusFilter} merge requests
          </div>
        )}

        {mrs?.map((mr) => (
          <MRListItem
            key={mr.iid}
            mr={mr}
            isSelected={selectedMRIid === mr.iid}
            onClick={() => setMR(mr.iid)}
          />
        ))}
      </div>
    </section>
  );
};
