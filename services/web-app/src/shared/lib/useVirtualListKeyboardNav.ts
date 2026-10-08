import { useCallback } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

/** Attribute that marks the element to focus inside a virtual row. */
export const ROW_FOCUS_ATTR = "data-row-focus";

const NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

// A row scrolled into view is mounted on the next virtualizer render, which can
// take a couple of frames; give up quietly afterwards.
const FOCUS_RETRY_FRAMES = 4;

const isAnyRow = (): boolean => true;

const scan = (
  from: number,
  step: 1 | -1,
  count: number,
  isFocusable: (index: number) => boolean
): number | null => {
  for (let index = from; index >= 0 && index < count; index += step) {
    if (isFocusable(index)) return index;
  }
  return null;
};

/**
 * Row an Arrow/Home/End key moves to, stepping over rows that cannot take focus
 * (section labels, dividers). Stays on `current` when there is nowhere to go.
 */
export const findNextFocusableIndex = (
  key: string,
  current: number,
  count: number,
  isFocusable: (index: number) => boolean = isAnyRow
): number => {
  let target: number | null;
  if (key === "Home") target = scan(0, 1, count, isFocusable);
  else if (key === "End") target = scan(count - 1, -1, count, isFocusable);
  else if (key === "ArrowDown") target = scan(current + 1, 1, count, isFocusable);
  else target = scan(current - 1, -1, count, isFocusable);
  return target ?? current;
};

const focusRow = (container: HTMLElement, index: number, framesLeft: number): void => {
  const target = container.querySelector<HTMLElement>(
    `[data-index="${String(index)}"] [${ROW_FOCUS_ATTR}]`
  );
  if (target) {
    target.focus({ preventScroll: true });
    return;
  }
  if (framesLeft > 0) {
    requestAnimationFrame(() => {
      focusRow(container, index, framesLeft - 1);
    });
  }
};

/**
 * Arrow/Home/End navigation for a virtualized list. Rows outside the rendered
 * window are not in the DOM, so Tab alone cannot reach them; this scrolls the
 * target row into view first and focuses it once it is mounted.
 */
export const useVirtualListKeyboardNav = <TScrollElement extends Element>(
  virtualizer: Virtualizer<TScrollElement, Element>,
  count: number,
  /** Rows without a focus target (labels, dividers) are skipped; all rows by default. */
  isFocusable: (index: number) => boolean = isAnyRow
): ((event: React.KeyboardEvent<HTMLElement>) => void) =>
  useCallback(
    (event: React.KeyboardEvent<HTMLElement>): void => {
      if (!NAV_KEYS.has(event.key) || count === 0) return;
      if (!(event.target instanceof HTMLElement)) return;
      const row = event.target.closest<HTMLElement>("[data-index]");
      if (!row) return;
      const current = Number(row.dataset.index);
      const next = findNextFocusableIndex(event.key, current, count, isFocusable);
      event.preventDefault();
      if (next === current) return;
      virtualizer.scrollToIndex(next, { align: "auto" });
      focusRow(event.currentTarget, next, FOCUS_RETRY_FRAMES);
    },
    [virtualizer, count, isFocusable]
  );
