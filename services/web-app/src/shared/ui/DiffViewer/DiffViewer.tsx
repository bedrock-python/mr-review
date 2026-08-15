import { memo, useEffect, useMemo, useRef } from "react";
import { cn } from "@shared/lib";
import { attachFileInfo, parseDiff } from "./parseDiff";
import type { DiffLineWithFile, DiffViewerProps, LineDecorationRenderer } from "./types";

const HIGHLIGHT_CLASS = "diff-row-highlight";
const ACTIVE_DECORATION_CLASS = "diff-pin-active";
// Above this distance a smooth scroll animates through thousands of rows and reads as lag.
const SMOOTH_SCROLL_MAX_PX = 2000;

const isContentLine = (line: DiffLineWithFile): boolean =>
  line.type === "added" || line.type === "removed" || line.type === "context";

const rowBackgroundClass = (type: DiffLineWithFile["type"]): string => {
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

const rowKey = (file: string, line: number): string => `${file}:${String(line)}`;

const escapeAttributeValue = (value: string): string => value.replace(/["\\]/g, "\\$&");

type DiffRowsProps<T> = {
  lines: DiffLineWithFile[];
  showOldGutter: boolean;
  commentsOnLines?: Map<number, readonly T[]> | undefined;
  renderLineDecoration?: LineDecorationRenderer<T> | undefined;
};

const DiffRowsBase = <T,>({
  lines,
  showOldGutter,
  commentsOnLines,
  renderLineDecoration,
}: DiffRowsProps<T>): React.ReactElement => (
  <tbody>
    {lines.map((line, idx) => {
      const lineComments =
        isContentLine(line) && line.newLine !== null
          ? ((commentsOnLines?.get(line.newLine) ?? []).filter(
              (entry) => !hasFileField(entry) || entry.file === null || entry.file === line.file
            ) as readonly T[])
          : ([] as readonly T[]);

      return (
        <tr
          key={idx}
          data-diff-row={line.newLine !== null ? rowKey(line.file, line.newLine) : undefined}
          role="row"
          aria-label={ariaLabelFor(line)}
          className={cn("align-top leading-[18px]", rowBackgroundClass(line.type))}
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
);

// Rows are the expensive part of a large diff, so they never see the highlight —
// moving between comments must not re-render thousands of rows.
const DiffRows = memo(DiffRowsBase) as typeof DiffRowsBase;

export const DiffViewer = <T,>({
  diff,
  mode = "full",
  highlightFile = null,
  highlightLine = null,
  activeDecorationId = null,
  commentsOnLines,
  renderLineDecoration,
  className,
  ariaLabel,
}: DiffViewerProps<T>): React.ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => attachFileInfo(parseDiff(diff)), [diff]);

  // Highlight and scrolling are applied to the DOM directly: re-rendering the table
  // for every navigation step is what made switching comments feel laggy.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previous = container.querySelector(`.${HIGHLIGHT_CLASS}`);
    if (previous) {
      previous.classList.remove(HIGHLIGHT_CLASS);
      previous.removeAttribute("aria-current");
    }

    if (highlightFile === null || highlightLine === null) return;

    const selector = `[data-diff-row="${escapeAttributeValue(rowKey(highlightFile, highlightLine))}"]`;
    const row = container.querySelector<HTMLTableRowElement>(selector);
    if (!row) return;

    row.classList.add(HIGHLIGHT_CLASS);
    row.setAttribute("aria-current", "true");

    if (typeof container.scrollTo !== "function") return;
    const top = row.offsetTop - container.clientHeight / 2 + row.offsetHeight / 2;
    const distance = Math.abs(container.scrollTop - top);
    container.scrollTo({ top, behavior: distance > SMOOTH_SCROLL_MAX_PX ? "auto" : "smooth" });
  }, [highlightFile, highlightLine, lines]);

  // Marks which pin the right-hand panel is currently editing.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previous = container.querySelector(`.${ACTIVE_DECORATION_CLASS}`);
    previous?.classList.remove(ACTIVE_DECORATION_CLASS);

    if (activeDecorationId === null) return;
    const selector = `[data-decoration-id="${escapeAttributeValue(activeDecorationId)}"]`;
    container.querySelector(selector)?.classList.add(ACTIVE_DECORATION_CLASS);
  }, [activeDecorationId, lines]);

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
        <DiffRows
          lines={lines}
          showOldGutter={showOldGutter}
          commentsOnLines={commentsOnLines}
          renderLineDecoration={renderLineDecoration}
        />
      </table>
    </div>
  );
};
