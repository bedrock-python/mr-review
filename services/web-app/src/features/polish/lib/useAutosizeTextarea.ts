import { useLayoutEffect } from "react";
import type { RefObject } from "react";

const MAX_AUTOSIZE_HEIGHT_PX = 420;

/** Grow the textarea with its content up to a cap, then let it scroll. */
export const useAutosizeTextarea = (
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  isActive = true
): void => {
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!isActive || textarea === null) return;
    // Reset first so the textarea can also shrink when text is deleted.
    textarea.style.height = "auto";
    const height = Math.min(textarea.scrollHeight, MAX_AUTOSIZE_HEIGHT_PX);
    textarea.style.height = height > 0 ? `${String(height)}px` : "";
    textarea.style.overflowY = textarea.scrollHeight > MAX_AUTOSIZE_HEIGHT_PX ? "auto" : "hidden";
  }, [ref, value, isActive]);
};
