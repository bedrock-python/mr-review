const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focuses the first focusable element inside the first container that has one. */
export const focusFirstIn = (...containers: (HTMLElement | null)[]): boolean => {
  for (const container of containers) {
    const target = container?.querySelector<HTMLElement>(FOCUSABLE);
    if (target) {
      target.focus();
      return true;
    }
  }
  return false;
};
