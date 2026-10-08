import { useMemo } from "react";
import { DiffTable } from "./DiffTable";
import { attachFileInfo, parseDiff } from "./parseDiff";
import type { DiffViewerProps } from "./types";

/** A unified diff as a table of lines; long diffs only render the rows on screen. */
export const DiffViewer = <T,>({ diff, ...tableProps }: DiffViewerProps<T>): React.ReactElement => {
  const lines = useMemo(() => attachFileInfo(parseDiff(diff)), [diff]);
  return <DiffTable<T> lines={lines} {...tableProps} />;
};
