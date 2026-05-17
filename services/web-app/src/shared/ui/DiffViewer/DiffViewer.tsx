import { useEffect, useMemo, useRef } from "react";
import { cn } from "@shared/lib";
import { attachFileInfo, parseDiff } from "./parseDiff";
import type { DiffLineWithFile, DiffViewerProps } from "./types";

const isContentLine = (line: DiffLineWithFile): boolean =>
  line.type === "added" || line.type === "removed" || line.type === "context";

const rowBackgroundClass = (type: DiffLineWithFile["type"], highlighted: boolean): string => {
  if (highlighted) {
    return "bg-[color-mix(in_oklch,var(--accent)_18%,transparent)] outline outline-1 -outline-offset-1 outline-[color-mix(in_oklch,var(--accent)_60%,transparent)]";
  }
  switch (type) {
    case "file":
      return "bg-[var(--bg-2)] text-[var(--accent)]";
    case "header":
      return "bg-[var(--bg-2)] text-[var(--fg-3)]";
    case "added":
      return "bg-[var(--diff-add-bg)] text-[var(--diff-add-fg)]";
    case "removed":
      return "bg-[var(--diff-del-bg)] text-[var(--diff-del-fg)]";
    default:
      return "bg-transparent text-[var(--fg-1)]";
  }
};

const signCharacter = (type: DiffLineWithFile["type"]): string => {
  if (type === "added") return "+";
  if (type === "removed") return "−";
  return " ";
};

const ariaLabelFor = (line: DiffLineWithFile): string => {
  const lineNo = line.newLine ?? line.oldLine ?? 0;
  switch (line.type) {
    case "added":
      return `Added line ${String(lineNo)}: ${line.content}`;
    case "removed":
      return `Removed line ${String(lineNo)}: ${line.content}`;
    case "context":
      return `Context line ${String(lineNo)}: ${line.content}`;
    case "header":
      return `Hunk header: ${line.content}`;
    case "file":
      return `File header: ${line.content}`;
  }
};

const hasFileField = (value: unknown): value is { file: string | null } =>
  typeof value === "object" && value !== null && "file" in value;

export const DiffViewer = <T,>({
  diff,
  mode = "full",
  highlightFile = null,
  highlightLine = null,
  commentsOnLines,
  renderLineDecoration,
  className,
  ariaLabel,
}: DiffViewerProps<T>): React.ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRowRef = useRef<HTMLTableRowElement>(null);

  const lines = useMemo(() => attachFileInfo(parseDiff(diff)), [diff]);

  useEffect(() => {
    const container = containerRef.current;
    const row = highlightRowRef.current;
    if (!container || !row) return;
    if (typeof container.scrollTo !== "function") return;
    const containerHeight = container.clientHeight;
    container.scrollTo({
      top: row.offsetTop - containerHeight / 2 + row.offsetHeight / 2,
      behavior: "smooth",
    });
  }, [highlightFile, highlightLine]);

  if (lines.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center text-[12px] text-[var(--fg-3)]",
          className
        )}
        role="status"
      >
        No diff available
      </div>
    );
  }

  const showOldGutter = mode === "full";

  return (
    <div ref={containerRef} className={cn("h-full overflow-auto font-mono text-[11px]", className)}>
      <table
        role="table"
        aria-label={ariaLabel ?? "Code diff"}
        className="w-full table-fixed border-collapse"
      >
        <colgroup>
          {showOldGutter && <col style={{ width: 40 }} />}
          <col style={{ width: 40 }} />
          <col style={{ width: 14 }} />
          <col />
          <col style={{ width: 1 }} />
        </colgroup>
        <thead className="sr-only">
          <tr>
            {showOldGutter && <th scope="col">Old line</th>}
            <th scope="col">New line</th>
            <th scope="col">Change type</th>
            <th scope="col">Content</th>
            <th scope="col">Inline annotations</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => {
            const isHighlighted =
              highlightFile !== null &&
              highlightLine !== null &&
              line.file === highlightFile &&
              line.newLine === highlightLine;

            const lineComments =
              isContentLine(line) && line.newLine !== null
                ? ((commentsOnLines?.get(line.newLine) ?? []).filter(
                    (entry) =>
                      !hasFileField(entry) || entry.file === null || entry.file === line.file
                  ) as readonly T[])
                : ([] as readonly T[]);

            const bgClass = rowBackgroundClass(line.type, isHighlighted);

            return (
              <tr
                key={idx}
                ref={isHighlighted ? highlightRowRef : undefined}
                role="row"
                aria-label={ariaLabelFor(line)}
                aria-current={isHighlighted ? "true" : undefined}
                className={cn("align-top leading-[18px]", bgClass)}
              >
                {showOldGutter && (
                  <th
                    scope="row"
                    className="px-1.5 py-[1px] text-right font-mono text-[11px] font-normal text-[var(--fg-3)] select-none"
                  >
                    {line.oldLine ?? ""}
                  </th>
                )}
                <th
                  scope="row"
                  className="px-2 py-[1px] text-right font-mono text-[11px] font-normal text-[var(--fg-3)] select-none"
                >
                  {line.newLine ?? ""}
                </th>
                <td
                  aria-hidden="true"
                  className={cn(
                    "text-center select-none",
                    line.type === "added" && "text-[var(--diff-add-fg)]",
                    line.type === "removed" && "text-[var(--diff-del-fg)]",
                    (line.type === "context" || line.type === "header" || line.type === "file") &&
                      "text-[var(--fg-3)]"
                  )}
                >
                  {signCharacter(line.type)}
                </td>
                <td className="py-[1px] pr-2 break-all whitespace-pre-wrap">{line.content}</td>
                <td>
                  {(lineComments.length > 0 || renderLineDecoration !== undefined) && (
                    <div className="flex gap-[2px] px-1.5 py-[1px]">
                      {renderLineDecoration?.({ line, comments: lineComments })}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
