import { useLayoutEffect, useState } from "react";

/**
 * The element's outer width, kept current as it resizes; `null` until it has been measured
 * (or where nothing can be measured, as in jsdom). Measured before the first paint, so a
 * layout chosen from it does not flash.
 */
export const useElementWidth = (ref: React.RefObject<HTMLElement | null>): number | null => {
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const update = (): void => {
      const next = element.getBoundingClientRect().width;
      // Zero means "not laid out" (hidden, or no layout engine), not "very narrow".
      setWidth(next > 0 ? next : null);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return width;
};
