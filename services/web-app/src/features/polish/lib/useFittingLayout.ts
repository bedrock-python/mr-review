import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

const OPEN_LAYER_SELECTOR = '[role="dialog"][data-state="open"], [role="menu"][data-state="open"]';

/**
 * Picks the roomiest of `layouts` (ordered from roomiest to tightest) that keeps a wrapping
 * row on one line. The row is measured, not guessed from breakpoints, so it holds for every
 * theme and font.
 *
 * - It measures when the row's container changes width and when `contentKey` changes (pass
 *   what changes the row's width: counts, badges, a slot that appears), and steps to a tighter
 *   layout while the row wraps.
 * - It steps back to a roomier layout once the container is wider than where that layout last
 *   wrapped, and starts over from the roomiest when the content, the theme or the fonts
 *   change. Starting over waits while focus is in the row or a menu or popover is open, so a
 *   control the user is on is never swapped from under them.
 *
 * Each step is rendered and measured before the browser paints, so a layout that does not fit
 * is never shown. Where nothing is laid out (jsdom) the first layout stays.
 */
export const useFittingLayout = <T extends string>(
  ref: React.RefObject<HTMLElement | null>,
  layouts: readonly [T, ...T[]],
  contentKey: string
): T => {
  const [index, setIndex] = useState(0);
  // The layout asked for; ahead of `index` while a step is waiting to render.
  const requested = useRef(0);
  // Width at which each layout last wrapped: a roomier layout is tried again only beyond it.
  const failedAtWidth = useRef(new Map<number, number>());
  const lastContentKey = useRef(contentKey);
  const isRestartPending = useRef(false);
  const lastIndex = layouts.length - 1;

  const request = useCallback((next: number) => {
    requested.current = next;
    setIndex(next);
  }, []);

  /** Measures the rendered layout and asks for the next one to try, if any. */
  const step = useCallback(() => {
    const element = ref.current;
    if (element === null) return;
    const current = requested.current;
    const { width, height } = element.getBoundingClientRect();
    if (width === 0) return;
    const minHeight = Number.parseFloat(getComputedStyle(element).minHeight) || 0;
    // Taller than one line of controls: the content wrapped.
    const isWrapped = height > minHeight + 1;
    if (isWrapped && current < lastIndex) {
      failedAtWidth.current.set(current, width);
      request(current + 1);
      return;
    }
    const failedAt = failedAtWidth.current.get(current - 1);
    if (!isWrapped && failedAt !== undefined && width > failedAt) request(current - 1);
  }, [ref, lastIndex, request]);

  const isBusy = useCallback((): boolean => {
    const active = document.activeElement;
    const isFocusInRow = active !== null && ref.current?.contains(active) === true;
    return isFocusInRow || document.querySelector(OPEN_LAYER_SELECTOR) !== null;
  }, [ref]);

  /** Forgets where layouts wrapped and goes back to the roomiest; the steps follow. */
  const restart = useCallback(() => {
    isRestartPending.current = false;
    failedAtWidth.current.clear();
    if (requested.current === 0) step();
    else request(0);
  }, [step, request]);

  // New content: start over, or, while the user is in the row, only step down if it wraps now.
  useLayoutEffect(() => {
    if (lastContentKey.current === contentKey) return;
    lastContentKey.current = contentKey;
    if (isBusy()) isRestartPending.current = true;
    else restart();
  }, [contentKey, isBusy, restart]);

  // A layout was rendered or the content changed: measure it. Runs again after each step, all
  // before the paint; other renders (a keystroke, a focus move) measure nothing.
  useLayoutEffect(() => {
    if (requested.current === index) step();
  }, [index, contentKey, step]);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // From an observer or an event: rendered at once, so the steps land before the paint.
    const remeasure = (): void => {
      flushSync(step);
    };
    const restartWhenFree = (): void => {
      if (isBusy()) isRestartPending.current = true;
      else flushSync(restart);
    };
    // Focus has to settle on its new element before the row can tell it is free.
    const handleFocusOut = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (isRestartPending.current) restartWhenFree();
      }, 0);
    };

    // The container, not the row: the row's own height changes as it wraps, and stepping in
    // its observer would change what that observer watches.
    const container = element.parentElement;
    const resizeObserver =
      container !== null && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(remeasure)
        : null;
    if (container !== null) resizeObserver?.observe(container);

    // Another theme brings other fonts and letter spacing.
    const themeObserver = new MutationObserver(restartWhenFree);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const fonts = "fonts" in document ? document.fonts : null;
    fonts?.addEventListener("loadingdone", restartWhenFree);
    // Focus leaves the row through the document, popovers included (they are portals).
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      clearTimeout(timer);
      resizeObserver?.disconnect();
      themeObserver.disconnect();
      fonts?.removeEventListener("loadingdone", restartWhenFree);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, [ref, step, restart, isBusy]);

  return layouts[index] ?? layouts[0];
};
