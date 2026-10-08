import { memo } from "react";
import { cn } from "@shared/lib";
import { diffRowKey } from "./diffRows";
import type { DiffLineWithFile, LineDecorationRenderer } from "./types";

const rowBackgroundClass = (type: DiffLineWithFile["type"]): string => {
  switch (type) {
    case "file":
      return "bg-[var(--bg-2)] text-[var(--fg-0)] font-medium border-t border-[var(--border)]";
    case "header":
      return "bg-[var(--diff-hunk)] text-[var(--fg-2)]";
    case "added":
      return "bg-[var(--diff-add-bg)] text-[var(--diff-add-fg)]";
    case "removed":
      return "bg-[var(--diff-del-bg)] text-[var(--diff-del-fg)]";
    default:
      return "bg-transparent text-[var(--fg-1)]";
  }
};

const SIGNS: Record<DiffLineWithFile["type"], string> = {
  added: "+",
  removed: "−",
  context: " ",
  header: " ",
  file: " ",
};

// Read by screen readers in place of the sign, so the change type is not colour-only.
const CHANGE_LABELS: Partial<Record<DiffLineWithFile["type"], string>> = {
  added: "added",
  removed: "removed",
};

export type DiffRowProps<T> = {
  line: DiffLineWithFile;
  showOldGutter: boolean;
  comments: readonly T[];
  renderLineDecoration?: LineDecorationRenderer<T> | undefined;
  /** Position in the diff, for the virtualizer to measure the row. */
  index?: number;
  measureRef?: ((element: HTMLTableRowElement | null) => void) | undefined;
};

const DiffRowBase = <T,>({
  line,
  showOldGutter,
  comments,
  renderLineDecoration,
  index,
  measureRef,
}: DiffRowProps<T>): React.ReactElement => {
  const changeLabel = CHANGE_LABELS[line.type];
  return (
    <tr
      ref={measureRef}
      data-index={index}
      data-diff-row={line.newLine !== null ? diffRowKey(line.file, line.newLine) : undefined}
      data-line-type={line.type}
      className={cn("align-top leading-[18px]", rowBackgroundClass(line.type))}
    >
      {showOldGutter && (
        <th
          scope="row"
          className="px-(--space-1) py-[1px] text-right font-mono text-[11px] font-normal text-[var(--fg-2)] select-none"
        >
          {line.oldLine ?? ""}
        </th>
      )}
      <th
        scope="row"
        className="px-(--space-1) py-[1px] text-right font-mono text-[11px] font-normal text-[var(--fg-2)] select-none"
      >
        {line.newLine ?? ""}
      </th>
      <td
        className={cn(
          "text-center select-none",
          line.type === "added" && "text-[var(--diff-add-fg)]",
          line.type === "removed" && "text-[var(--diff-del-fg)]",
          !changeLabel && "text-[var(--fg-2)]"
        )}
      >
        <span aria-hidden="true">{SIGNS[line.type]}</span>
        {changeLabel && <span className="sr-only">{changeLabel}</span>}
      </td>
      <td className="py-[1px] pr-(--space-2) break-all whitespace-pre-wrap">{line.content}</td>
      <td>
        {(comments.length > 0 || renderLineDecoration !== undefined) && (
          <div className="flex gap-[2px] px-(--space-1) py-[1px]">
            {renderLineDecoration?.({ line, comments })}
          </div>
        )}
      </td>
    </tr>
  );
};

export const DiffRow = memo(DiffRowBase) as typeof DiffRowBase;
