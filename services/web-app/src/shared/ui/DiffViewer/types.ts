export type DiffLineType = "header" | "added" | "removed" | "context" | "file";

export type DiffLine = {
  type: DiffLineType;
  content: string;
  newLine: number | null;
  oldLine: number | null;
};

export type DiffLineWithFile = DiffLine & { file: string };

export type DiffViewerMode = "full" | "hunk";

export type LineDecorationRenderer<T = unknown> = (args: {
  line: DiffLineWithFile;
  comments: readonly T[];
}) => React.ReactNode;

export type DiffViewerProps<T = unknown> = {
  diff: string;
  mode?: DiffViewerMode;
  highlightFile?: string | null;
  highlightLine?: number | null;
  commentsOnLines?: Map<number, readonly T[]>;
  renderLineDecoration?: LineDecorationRenderer<T>;
  className?: string;
  ariaLabel?: string;
};

export type HunkDiffProps<T = unknown> = Omit<DiffViewerProps<T>, "mode">;
