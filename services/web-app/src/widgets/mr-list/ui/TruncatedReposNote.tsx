import { Disclosure } from "@shared/ui";

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
  <Disclosure
    variant="inline"
    headingLevel="none"
    shouldKeepMounted
    title={<span className="text-(length:--fs-meta)">{describe(repoPaths.length)}</span>}
    className="border-border shrink-0 border-b px-(--space-3) py-(--space-1)"
  >
    <div
      role="group"
      aria-label="Repositories with more open MRs"
      className="grid justify-items-start gap-px"
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
  </Disclosure>
);
