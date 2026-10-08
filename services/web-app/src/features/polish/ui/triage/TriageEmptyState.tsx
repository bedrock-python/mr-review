type TriageEmptyStateProps = {
  hasComments: boolean;
  onClearFilters: () => void;
};

export const TriageEmptyState = ({
  hasComments,
  onClearFilters,
}: TriageEmptyStateProps): React.ReactElement => (
  <div className="text-fg-3 flex h-full flex-col items-center justify-center gap-2 text-[13px]">
    {hasComments ? (
      <>
        No comments match these filters.
        <button type="button" className="btn ghost" onClick={onClearFilters}>
          Clear filters
        </button>
      </>
    ) : (
      "No comments yet."
    )}
  </div>
);
