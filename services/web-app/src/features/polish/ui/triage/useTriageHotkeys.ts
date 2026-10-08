import { useHotkeys } from "react-hotkeys-hook";
import type { CommentSeverity, CommentStatus } from "@entities/review";

export type TriageHotkeyHandlers = {
  isEnabled: boolean;
  isEditing: boolean;
  onMove: (delta: number) => void;
  onSetStatus: (status: CommentStatus) => void;
  onEdit: () => void;
  onSetSeverity: (severity: CommentSeverity) => void;
  onToggleContext: () => void;
  onNew: () => void;
  onSearch: () => void;
  onUndo: () => void;
  onHelp: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
};

const SEVERITY_BY_KEY: Partial<Record<string, CommentSeverity>> = {
  "1": "critical",
  "2": "major",
  "3": "minor",
  "4": "suggestion",
};

const LAYER_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"]';
const OPEN_LAYER_SELECTOR =
  '[aria-modal="true"], [role="dialog"][data-state="open"], [role="menu"][data-state="open"]';
const TOOLTIP_SELECTOR = '[role="tooltip"]';

/**
 * An open tooltip closes on Esc and marks the key handled, before these keys see it (Radix
 * listens in the capture phase). A tooltip is only a hint, not a layer the user is in, so
 * that Esc must still cancel an edit. Menus, popovers and dialogs are caught by the layer
 * checks below either way.
 */
const isTooltipEscape = (event: KeyboardEvent): boolean =>
  event.key === "Escape" && document.querySelector(TOOLTIP_SELECTOR) !== null;

/**
 * The keys listen on the whole document, so they must stand down while any other layer has
 * the user's attention — a dialog, popover or menu the event comes from, or one open anywhere
 * on the page (the triage view's own dialogs switch the keys off through `isEnabled`) — and
 * for a key a control already handled: ← → in a segmented control, ↓ on a menu button.
 */
const isForAnotherLayer = (event: KeyboardEvent): boolean =>
  (event.defaultPrevented && !isTooltipEscape(event)) ||
  (event.target instanceof Element && event.target.closest(LAYER_SELECTOR) !== null) ||
  document.querySelector(OPEN_LAYER_SELECTOR) !== null;

const SEGMENTED_CONTROL_ROLES = ["radio"] as const;

const hasCommandModifier = (event: KeyboardEvent): boolean =>
  event.ctrlKey || event.metaKey || event.altKey;

/**
 * Global triage keys. react-hotkeys-hook ignores events from inputs, textareas, selects and
 * menu items, so nothing here fires while the user types; the editor handles its own Esc / ⌘↵
 * and these two only cover the case where focus is elsewhere while an editor is open.
 */
export const useTriageHotkeys = ({
  isEnabled,
  isEditing,
  onMove,
  onSetStatus,
  onEdit,
  onSetSeverity,
  onToggleContext,
  onNew,
  onSearch,
  onUndo,
  onHelp,
  onCancelEdit,
  onSaveEdit,
}: TriageHotkeyHandlers): void => {
  const base = {
    preventDefault: true,
    ignoreEventWhen: isForAnotherLayer,
    // A segmented control (view, status) keeps focus after a click; the triage keys must
    // still work from there, ↑ ↓ included. Its ← → are its own: it marks them handled.
    enableOnFormTags: SEGMENTED_CONTROL_ROLES,
  };
  const always = { ...base, enabled: isEnabled };
  const whenIdle = { ...base, enabled: isEnabled && !isEditing };
  const whenEditing = { ...base, enabled: isEnabled && isEditing };
  // Matched on the produced character, because "/" and "?" sit on different keys (and need
  // Shift) on different layouts; a held Ctrl/⌘/Alt still means a browser shortcut.
  const byCharacter = {
    useKey: true,
    ignoreModifiers: true,
    ignoreEventWhen: (event: KeyboardEvent) =>
      isForAnotherLayer(event) || hasCommandModifier(event),
  };

  useHotkeys(
    "j, down",
    () => {
      onMove(1);
    },
    always
  );
  useHotkeys(
    "k, up",
    () => {
      onMove(-1);
    },
    always
  );
  useHotkeys(
    "a",
    () => {
      onSetStatus("kept");
    },
    whenIdle
  );
  useHotkeys(
    "d",
    () => {
      onSetStatus("dismissed");
    },
    whenIdle
  );
  useHotkeys(
    "e",
    () => {
      onEdit();
    },
    whenIdle
  );
  useHotkeys(
    "1, 2, 3, 4",
    (_event, hotkey) => {
      const severity = SEVERITY_BY_KEY[hotkey.keys?.[0] ?? ""];
      if (severity !== undefined) onSetSeverity(severity);
    },
    whenIdle
  );
  useHotkeys(
    "c",
    () => {
      onToggleContext();
    },
    whenIdle
  );
  useHotkeys(
    "n",
    () => {
      onNew();
    },
    whenIdle
  );
  useHotkeys(
    "/",
    () => {
      onSearch();
    },
    { ...whenIdle, ...byCharacter }
  );
  useHotkeys(
    "u",
    () => {
      onUndo();
    },
    whenIdle
  );
  useHotkeys(
    "?",
    () => {
      onHelp();
    },
    { ...always, ...byCharacter }
  );
  useHotkeys(
    "escape",
    () => {
      onCancelEdit();
    },
    whenEditing
  );
  useHotkeys(
    "mod+enter",
    () => {
      onSaveEdit();
    },
    whenEditing
  );
};
