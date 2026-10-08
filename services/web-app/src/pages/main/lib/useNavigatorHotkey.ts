import { useHotkeys } from "react-hotkeys-hook";
import { NAVIGATOR_SHORTCUT } from "@widgets/mr-header";

const OPEN_MODAL_SELECTOR = '[aria-modal="true"], [role="dialog"][data-state="open"]';

/** A dialog has the user's attention, or a held Ctrl/⌘/Alt makes it a browser shortcut. */
const shouldIgnore = (event: KeyboardEvent): boolean =>
  event.ctrlKey ||
  event.metaKey ||
  event.altKey ||
  document.querySelector(OPEN_MODAL_SELECTOR) !== null;

/**
 * "[" shows and hides the navigator. Matched on the produced character, which sits on
 * different keys on different layouts; never while typing (react-hotkeys-hook skips form
 * fields) or while a dialog is open.
 */
export const useNavigatorHotkey = (onToggle: () => void): void => {
  useHotkeys(
    NAVIGATOR_SHORTCUT,
    () => {
      onToggle();
    },
    { useKey: true, preventDefault: true, ignoreEventWhen: shouldIgnore }
  );
};
