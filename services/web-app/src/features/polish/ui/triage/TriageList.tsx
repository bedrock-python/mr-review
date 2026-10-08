import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { Range } from "@tanstack/react-virtual";
import { CommentCard } from "./CommentCard";
import { GroupHeader } from "./GroupHeader";
import { cardDomId } from "./triageContext";
import type { TriageRow } from "../../lib";

export type FocusRequest = { id: string; seq: number };

export type TriageListProps = {
  rows: TriageRow[];
  focusedId: string | null;
  focusRequest: FocusRequest | null;
  editingId: string | null;
  expandedIds: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
};

// Below this many cards plain rendering is cheaper than measuring rows.
export const VIRTUALIZE_THRESHOLD = 80;
// Measured rows plus the 8px gap under each: a group header is 30px; a card with a
// one-line comment and its "Show code" row is 110px, longer comments and code run taller.
const GROUP_ROW_ESTIMATE_PX = 38;
const CARD_ROW_ESTIMATE_PX = 150;
const VIRTUAL_OVERSCAN = 6;
const SCROLL_AREA_CLASS = "h-full overflow-auto px-(--space-4) py-(--space-3)";

const rowKey = (row: TriageRow): string =>
  row.kind === "group" ? `group:${row.group.key}` : row.comment.id;

const focusCard = (id: string): void => {
  document.getElementById(cardDomId(id))?.focus({ preventScroll: true });
};

const RowContent = ({
  row,
  focusedId,
  editingId,
  expandedIds,
  onToggleGroup,
}: { row: TriageRow } & Omit<TriageListProps, "rows" | "focusRequest">): React.ReactElement => {
  if (row.kind === "group") {
    return <GroupHeader group={row.group} isCollapsed={row.isCollapsed} onToggle={onToggleGroup} />;
  }
  const { id } = row.comment;
  return (
    <CommentCard
      comment={row.comment}
      isFocused={id === focusedId}
      isEditing={id === editingId}
      isContextOpen={expandedIds.has(id)}
    />
  );
};

const PlainList = ({
  rows,
  focusedId,
  focusRequest,
  ...rest
}: TriageListProps): React.ReactElement => {
  useEffect(() => {
    if (focusedId === null) return;
    const card = document.getElementById(cardDomId(focusedId));
    if (typeof card?.scrollIntoView === "function") card.scrollIntoView({ block: "nearest" });
  }, [focusedId]);

  useEffect(() => {
    if (focusRequest !== null) focusCard(focusRequest.id);
  }, [focusRequest]);

  return (
    <div className={SCROLL_AREA_CLASS} aria-label="Comments">
      <div className="flex flex-col gap-(--space-2)">
        {rows.map((row) => (
          <RowContent key={rowKey(row)} row={row} focusedId={focusedId} {...rest} />
        ))}
      </div>
    </div>
  );
};

const VirtualList = ({
  rows,
  focusedId,
  focusRequest,
  ...rest
}: TriageListProps): React.ReactElement => {
  // The scroll element must belong to this component: a parent's ref is attached only after
  // this component's layout effects, and the virtualizer would mount with nothing to measure.
  const scrollRef = useRef<HTMLDivElement>(null);
  const { editingId } = rest;
  const editingIndex = useMemo(
    () => rows.findIndex((row) => row.kind === "comment" && row.comment.id === editingId),
    [rows, editingId]
  );
  // The card being edited stays mounted wherever the list is scrolled: unmounting it would
  // throw away the draft the user is in the middle of.
  const rangeExtractor = useCallback(
    (range: Range): number[] => {
      const indexes = defaultRangeExtractor(range);
      if (editingIndex < 0 || indexes.includes(editingIndex)) return indexes;
      return [...indexes, editingIndex].sort((a, b) => a - b);
    },
    [editingIndex]
  );
  // This build has no React Compiler, so the rule's concern (auto-memoising the virtualizer's
  // functions) does not apply; the instance never leaves this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      rows[index]?.kind === "group" ? GROUP_ROW_ESTIMATE_PX : CARD_ROW_ESTIMATE_PX,
    getItemKey: (index) => {
      const row = rows[index];
      return row === undefined ? index : rowKey(row);
    },
    overscan: VIRTUAL_OVERSCAN,
    rangeExtractor,
  });

  // Scroll only when focus moves. Rows change on every save; following them would yank the
  // list back to the focused card while the user is scrolling elsewhere.
  const latest = useRef({ rows, virtualizer });
  useLayoutEffect(() => {
    latest.current = { rows, virtualizer };
  });
  useEffect(() => {
    if (focusedId === null) return;
    const { rows: currentRows, virtualizer: current } = latest.current;
    const index = currentRows.findIndex(
      (row) => row.kind === "comment" && row.comment.id === focusedId
    );
    if (index >= 0) current.scrollToIndex(index, { align: "auto" });
  }, [focusedId]);

  useEffect(() => {
    if (focusRequest === null) return;
    // The card may only mount once the scroll above has rendered its window.
    const frame = requestAnimationFrame(() => {
      focusCard(focusRequest.id);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [focusRequest]);

  return (
    <div ref={scrollRef} className={SCROLL_AREA_CLASS} aria-label="Comments">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          if (row === undefined) return null;
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full pb-(--space-2)"
              style={{ transform: `translateY(${String(item.start)}px)` }}
            >
              <RowContent row={row} focusedId={focusedId} {...rest} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const TriageList = (props: TriageListProps): React.ReactElement => {
  const cardCount = props.rows.filter((row) => row.kind === "comment").length;
  return cardCount > VIRTUALIZE_THRESHOLD ? <VirtualList {...props} /> : <PlainList {...props} />;
};
