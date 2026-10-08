import { useEffect, useRef } from "react";

/**
 * A ref for the control that opened something in place (Edit, Add host): when `isOpen` turns
 * false, that control — back in the page now — gets the focus, instead of the focus falling
 * to <body> with the form that held it.
 */
export const useFocusWhenClosed = <T extends HTMLElement>(
  isOpen: boolean
): React.RefObject<T | null> => {
  const ref = useRef<T>(null);
  const wasOpen = useRef(isOpen);

  useEffect(() => {
    if (wasOpen.current && !isOpen) ref.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  return ref;
};
