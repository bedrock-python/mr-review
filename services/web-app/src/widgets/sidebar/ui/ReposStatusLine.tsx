export type ReposStatusLineProps = {
  loadedCount: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
};

/** "Showing 37 · scroll for more" while pages remain; null once all repositories are here. */
const formatReposStatus = ({
  loadedCount,
  hasNextPage,
  isFetchingNextPage,
}: ReposStatusLineProps): string | null => {
  if (isFetchingNextPage) return `Showing ${String(loadedCount)} · loading more…`;
  if (hasNextPage) return `Showing ${String(loadedCount)} · scroll for more`;
  return null;
};

/**
 * How much of the repository list is here, at its foot; empty when it is complete. The live
 * region itself always stays, so a line that appears is still announced.
 */
export const ReposStatusLine = (props: ReposStatusLineProps): React.ReactElement => {
  const status = formatReposStatus(props);
  return (
    <div aria-live="polite" className="shrink-0">
      {status !== null && (
        <p className="border-border text-fg-2 m-0 truncate border-t px-(--space-3) py-(--space-1) text-(length:--fs-meta) tabular-nums">
          {status}
        </p>
      )}
    </div>
  );
};
