const CANDIDATES = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[tabindex]",
  "[contenteditable='true']",
].join(",");

const isTabbable = (element: HTMLElement): boolean => {
  if (element.tabIndex < 0) return false;
  if ((element as HTMLButtonElement).disabled) return false;
  if (element.closest("[hidden], [inert], fieldset:disabled") !== null) return false;
  return true;
};

/**
 * The elements Tab stops at inside `root`, in document order. A group of native radios is one
 * stop: its checked radio, or its first one while none is checked.
 */
export const tabbablesIn = (root: ParentNode): HTMLElement[] => {
  const all = [...root.querySelectorAll<HTMLElement>(CANDIDATES)].filter(isTabbable);
  const radioStops = new Map<string, HTMLInputElement>();
  for (const element of all) {
    if (!(element instanceof HTMLInputElement) || element.type !== "radio" || !element.name) {
      continue;
    }
    const current = radioStops.get(element.name);
    if (current === undefined || (!current.checked && element.checked)) {
      radioStops.set(element.name, element);
    }
  }
  return all.filter(
    (element) =>
      !(element instanceof HTMLInputElement) ||
      element.type !== "radio" ||
      !element.name ||
      radioStops.get(element.name) === element
  );
};

/** The next Tab stop after `element` in the page, outside `exclude`; null at the end. */
export const nextTabbableAfter = (
  element: HTMLElement,
  exclude: Element | null
): HTMLElement | null => {
  const stops = tabbablesIn(document).filter(
    (stop) => stop === element || exclude?.contains(stop) !== true
  );
  const index = stops.indexOf(element);
  return index === -1 ? null : (stops[index + 1] ?? null);
};
