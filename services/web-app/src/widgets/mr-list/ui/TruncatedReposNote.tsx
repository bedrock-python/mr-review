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
  <details
    style={{
      flexShrink: 0,
      borderBottom: "1px solid var(--border)",
      padding: "5px 14px",
      fontSize: 11,
      color: "var(--fg-3)",
    }}
  >
    <summary style={{ cursor: "pointer" }}>{describe(repoPaths.length)}</summary>
    <div
      role="group"
      aria-label="Repositories with more open MRs"
      style={{ margin: "4px 0 0", display: "grid", gap: 2, justifyItems: "start" }}
    >
      {repoPaths.map((repoPath) => (
        <button
          key={repoPath}
          type="button"
          className="mono"
          onClick={() => {
            onOpenRepo(repoPath);
          }}
          style={{
            background: "transparent",
            border: "none",
            padding: "1px 0",
            fontSize: 11,
            color: "var(--fg-1)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {repoPath}
        </button>
      ))}
    </div>
  </details>
);
