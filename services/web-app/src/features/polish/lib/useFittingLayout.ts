import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Picks the roomiest of `layouts` (ordered from roomiest to tightest) that keeps a wrapping
 * row on one line. The row is measured, not guessed from breakpoints, so it holds for every
 * theme and font: it steps to a tighter layout when its content wraps, and back to a roomier
 * one only once it is wider than when that layout last failed. Before the first paint, so a
 * layout that does not fit is never shown. Where nothing is laid out (jsdom) the first layout
 * stays.
 */
export const useFittingLayout = <T extends string>(
  ref: React.RefObject<HTMLElement | null>,
  layouts: readonly [T, ...T[]]
): T => {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(index);
  const failedAtWidth = useRef(new Map<number, number>());

  const check = useCallback(() => {
    const element = ref.current;
    if (element === null) return;
    const { width, height } = element.getBoundingClientRect();
    if (width === 0) return;
    const minHeight = Number.parseFloat(getComputedStyle(element).minHeight) || 0;
    // Taller than one line of controls: the content wrapped.
    const isWrapped = height > minHeight + 1;
    const current = indexRef.current;
    let next = current;
    if (isWrapped && current < layouts.length - 1) {
      failedAtWidth.current.set(current, width);
      next = current + 1;
    } else if (!isWrapped && current > 0) {
      const failedAt = failedAtWidth.current.get(current - 1) ?? Number.POSITIVE_INFINITY;
      if (width > failedAt) next = current - 1;
    }
    if (next !== current) {
      indexRef.current = next;
      setIndex(next);
    }
  }, [ref, layouts.length]);

  // After every render: new content (a count, a badge) can make the row wrap.
  useLayoutEffect(check);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    // Fires for a new width and for a wrap (the row grows taller), fonts swapping in included.
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref, check]);

  return layouts[index] ?? layouts[0];
};
