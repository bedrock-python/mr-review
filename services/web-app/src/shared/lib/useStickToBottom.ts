import { useCallback, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

// Distance from the bottom that still counts as "at the bottom", so sub-pixel
// rounding of scroll offsets does not release the pin.
const BOTTOM_TOLERANCE_PX = 8;

export type StickToBottom<T extends HTMLElement> = {
  ref: RefObject<T | null>;
  handleScroll: () => void;
};

/**
 * Keeps a scroll container at its bottom while `content` grows, but only while
 * the user is there: scrolling up releases the pin and scrolling back down to the
 * bottom restores it. Attach `ref` and `handleScroll` (as `onScroll`) to the
 * scrolling element.
 */
export const useStickToBottom = <T extends HTMLElement>(content: unknown): StickToBottom<T> => {
  const ref = useRef<T>(null);
  const isPinnedRef = useRef(true);

  const handleScroll = useCallback((): void => {
    const element = ref.current;
    if (!element) return;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    isPinnedRef.current = distanceToBottom <= BOTTOM_TOLERANCE_PX;
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && isPinnedRef.current) element.scrollTop = element.scrollHeight;
  }, [content]);

  return { ref, handleScroll };
};
