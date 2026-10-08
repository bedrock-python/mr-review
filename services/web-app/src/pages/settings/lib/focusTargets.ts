/**
 * Markers for moving the focus within a settings list when the control that had it leaves
 * the page: `data-settings-list` on the list's card, `data-row-edit` on each row's Edit
 * button, `data-add-button` on the list's "Add …" button.
 */
export const SETTINGS_LIST_SELECTOR = "[data-settings-list]";
export const ROW_EDIT_SELECTOR = "[data-row-edit]";
export const ADD_BUTTON_SELECTOR = "[data-add-button]";

/**
 * Where the focus goes once a row is removed: the next row's Edit, or the list's Add button.
 * Picked while the row is still on the page — it leaves only when the list refetches.
 */
export const focusTargetAfterRow = (control: HTMLElement | null): HTMLElement | null => {
  const row = control?.closest("li");
  const nextEdit = row?.nextElementSibling?.querySelector<HTMLElement>(ROW_EDIT_SELECTOR);
  return (
    nextEdit ??
    row?.closest(SETTINGS_LIST_SELECTOR)?.querySelector<HTMLElement>(ADD_BUTTON_SELECTOR) ??
    null
  );
};
