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

/**
 * Global triage keys. react-hotkeys-hook ignores events from inputs, textareas and selects,
 * so nothing here fires while the user types; the editor handles its own Esc / ⌘↵ and these
 * two only cover the case where focus is elsewhere while an editor is open.
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
  const always = { enabled: isEnabled, preventDefault: true };
  const whenIdle = { enabled: isEnabled && !isEditing, preventDefault: true };
  const whenEditing = { enabled: isEnabled && isEditing, preventDefault: true };

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
  // Code-based and without shift, so Shift+/ ("?") never also lands here.
  useHotkeys(
    "slash",
    () => {
      onSearch();
    },
    whenIdle
  );
  useHotkeys(
    "u",
    () => {
      onUndo();
    },
    whenIdle
  );
  // Matched on the produced character: "?" sits on different keys across layouts.
  useHotkeys(
    "?",
    () => {
      onHelp();
    },
    { ...always, useKey: true, ignoreModifiers: true }
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
