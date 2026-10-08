import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * For a Radix dialog opened from state rather than a `Dialog.Trigger`: Radix has no trigger
 * to give focus back to on close, so focus would land on <body>. Remembers what had focus
 * when `isOpen` turned true; pass the result as `onCloseAutoFocus`.
 */
export const useReturnFocus = (isOpen: boolean): ((event: Event) => void) => {
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (isOpen && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
    }
  }, [isOpen]);

  return useCallback((event: Event): void => {
    event.preventDefault();
    if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    returnFocusRef.current = null;
  }, []);
};
