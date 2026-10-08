export type TruncatedReposNoteProps = {
  /** Repositories whose newest open MRs are all the inbox shows. */
  repoPaths: readonly string[];
  onOpenRepo: (repoPath: string) => void;
};

const describe = (count: number): string =>
  count === 1
    ? "1 repository has more open MRs — open it to see them all"
    : `${String(count)} repositories have more open MRs — open one to see them all`;

/**
 * The "All" inbox takes only the newest few open MRs of each repository; this names
 * the repositories that had more, so nothing is silently missing.
 */
export const TruncatedReposNote = ({
  repoPaths,
  onOpenRepo,
}: TruncatedReposNoteProps): React.ReactElement => (
  <details className="border-border text-fg-2 shrink-0 border-b px-(--space-3) py-(--space-1) text-(length:--fs-meta)">
    <summary className="hover:text-fg-1 cursor-pointer">{describe(repoPaths.length)}</summary>
    <div
      role="group"
      aria-label="Repositories with more open MRs"
      className="mt-(--space-1) grid justify-items-start gap-px"
    >
      {repoPaths.map((repoPath) => (
        <button
          key={repoPath}
          type="button"
          onClick={() => {
            onOpenRepo(repoPath);
          }}
          className="text-fg-1 hover:text-fg-0 rounded-(--radius-1) px-(--space-1) font-mono text-(length:--fs-meta) hover:underline"
        >
          {repoPath}
        </button>
      ))}
    </div>
  </details>
);
