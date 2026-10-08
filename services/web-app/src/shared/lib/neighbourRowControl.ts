/**
 * Where focus goes when a row of a list is removed: the matching control of the next row,
 * else of the previous one; null when the row was the only one (the caller picks a fallback).
 * Pick it while the row is still on the page.
 */
export const neighbourRowControl = (
  row: Element | null | undefined,
  selector: string
): HTMLElement | null =>
  row?.nextElementSibling?.querySelector<HTMLElement>(selector) ??
  row?.previousElementSibling?.querySelector<HTMLElement>(selector) ??
  null;

/**
 * Moves focus once the dialog that removed something has let go of it (its focus scope hands
 * focus back on a timeout of its own, so this runs after that).
 */
export const focusAfterDialog = (target: HTMLElement | null): void => {
  window.setTimeout(() => {
    if (target?.isConnected) target.focus();
  }, 0);
};
