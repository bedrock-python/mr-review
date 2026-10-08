import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@shared/lib";
import { DiffRow } from "./DiffRow";
import { commentsForLine, diffRowKey } from "./diffRows";
import type { DiffLineWithFile, DiffTableProps, LineDecorationRenderer } from "./types";

const HIGHLIGHT_CLASS = "diff-row-highlight";
const ACTIVE_DECORATION_CLASS = "diff-pin-active";
// Above this distance a smooth scroll animates through thousands of rows and reads as lag.
const SMOOTH_SCROLL_MAX_PX = 2000;
/**
 * From this many lines on, only the rows near the viewport are in the DOM. A row is five
 * cells; a 50 000-line merge request rendered whole was a quarter of a million nodes.
 */
export const VIRTUALIZE_FROM_LINES = 400;
// One line of 11px mono at 18px line height, plus the cell padding.
const ESTIMATED_ROW_PX = 20;
const OVERSCAN_ROWS = 30;

const escapeAttributeValue = (value: string): string => value.replace(/["\\]/g, "\\$&");

type AllRowsProps<T> = {
  lines: DiffLineWithFile[];
  showOldGutter: boolean;
  commentsOnLines?: Map<number, readonly T[]> | undefined;
  renderLineDecoration?: LineDecorationRenderer<T> | undefined;
};

const AllRowsBase = <T,>({
  lines,
  showOldGutter,
  commentsOnLines,
  renderLineDecoration,
}: AllRowsProps<T>): React.ReactElement => (
  <tbody>
    {lines.map((line, idx) => (
      <DiffRow<T>
        key={idx}
        line={line}
        showOldGutter={showOldGutter}
        comments={commentsForLine(line, commentsOnLines)}
        renderLineDecoration={renderLineDecoration}
      />
    ))}
  </tbody>
);

// A short diff is rendered whole. Its rows never see the highlight — moving between
// comments must not re-render every row.
const AllRows = memo(AllRowsBase) as typeof AllRowsBase;

const Spacer = ({ height, columns }: { height: number; columns: number }): React.ReactElement => (
  <tr aria-hidden="true">
    <td colSpan={columns} style={{ height, padding: 0, border: 0 }} />
  </tr>
);

/** A table of diff lines; long ones are windowed to what is on screen. */
export const DiffTable = <T,>({
  lines,
  mode = "full",
  highlightFile = null,
  highlightLine = null,
  activeDecorationId = null,
  commentsOnLines,
  renderLineDecoration,
  className,
  ariaLabel,
}: DiffTableProps<T>): React.ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isVirtual = lines.length >= VIRTUALIZE_FROM_LINES;
  const showOldGutter = mode === "full";
  const columns = showOldGutter ? 5 : 4;

  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer is read during render only, never memoized
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: OVERSCAN_ROWS,
    enabled: isVirtual,
  });

  const highlightKey =
    highlightFile !== null && highlightLine !== null
      ? diffRowKey(highlightFile, highlightLine)
      : null;
  const highlightIndex = useMemo(
    () =>
      highlightKey === null
        ? -1
        : lines.findIndex(
            (line) => line.newLine !== null && diffRowKey(line.file, line.newLine) === highlightKey
          ),
    [lines, highlightKey]
  );

  // Brings the target line into view when it changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || highlightIndex < 0) return;
    if (isVirtual) {
      virtualizer.scrollToIndex(highlightIndex, { align: "center" });
      return;
    }
    const row = container.querySelector<HTMLTableRowElement>(
      `[data-diff-row="${escapeAttributeValue(highlightKey ?? "")}"]`
    );
    if (!row || typeof container.scrollTo !== "function") return;
    const top = row.offsetTop - container.clientHeight / 2 + row.offsetHeight / 2;
    const distance = Math.abs(container.scrollTop - top);
    container.scrollTo({ top, behavior: distance > SMOOTH_SCROLL_MAX_PX ? "auto" : "smooth" });
    // The virtualizer is a new object every render; the target is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightIndex, highlightKey, isVirtual]);

  // Highlight and the active pin are set on the DOM, after every render: rows are not
  // re-rendered for them, and windowed rows are recreated as they scroll into view.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previous = container.querySelector(`.${HIGHLIGHT_CLASS}`);
    if (previous && previous.getAttribute("data-diff-row") !== highlightKey) {
      previous.classList.remove(HIGHLIGHT_CLASS);
      previous.removeAttribute("aria-current");
    }
    if (highlightKey !== null) {
      const row = container.querySelector(
        `[data-diff-row="${escapeAttributeValue(highlightKey)}"]`
      );
      row?.classList.add(HIGHLIGHT_CLASS);
      row?.setAttribute("aria-current", "true");
    }

    const decoration = container.querySelector(`.${ACTIVE_DECORATION_CLASS}`);
    if (decoration && decoration.getAttribute("data-decoration-id") !== activeDecorationId) {
      decoration.classList.remove(ACTIVE_DECORATION_CLASS);
    }
    if (activeDecorationId !== null) {
      container
        .querySelector(`[data-decoration-id="${escapeAttributeValue(activeDecorationId)}"]`)
        ?.classList.add(ACTIVE_DECORATION_CLASS);
    }
  });

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

  const virtualItems = isVirtual ? virtualizer.getVirtualItems() : [];
  const paddingTop = virtualItems[0]?.start ?? 0;
  const paddingBottom = isVirtual
    ? virtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0)
    : 0;

  return (
    <div
      ref={containerRef}
      data-virtual-scroll={isVirtual ? "" : undefined}
      className={cn("h-full overflow-auto font-mono text-[11px]", className)}
    >
      <table
        role="table"
        aria-label={ariaLabel ?? "Code diff"}
        aria-rowcount={isVirtual ? lines.length : undefined}
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
        {isVirtual ? (
          <tbody>
            {paddingTop > 0 && <Spacer height={paddingTop} columns={columns} />}
            {virtualItems.map((item) => {
              const line = lines[item.index];
              if (line === undefined) return null;
              return (
                <DiffRow<T>
                  key={item.key}
                  index={item.index}
                  measureRef={virtualizer.measureElement}
                  line={line}
                  showOldGutter={showOldGutter}
                  comments={commentsForLine(line, commentsOnLines)}
                  renderLineDecoration={renderLineDecoration}
                />
              );
            })}
            {paddingBottom > 0 && <Spacer height={paddingBottom} columns={columns} />}
          </tbody>
        ) : (
          <AllRows<T>
            lines={lines}
            showOldGutter={showOldGutter}
            commentsOnLines={commentsOnLines}
            renderLineDecoration={renderLineDecoration}
          />
        )}
      </table>
    </div>
  );
};
