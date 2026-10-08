export type ShortcutDescription = {
  /** Alternative keys ("j" or "↓"); a combination is one entry ("⌘/Ctrl ↵"). */
  keys: readonly string[];
  description: string;
};

export type ShortcutGroup = {
  title: string;
  shortcuts: readonly ShortcutDescription[];
};

export const TRIAGE_SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "Move",
    shortcuts: [
      { keys: ["j", "↓"], description: "Next comment" },
      { keys: ["k", "↑"], description: "Previous comment" },
    ],
  },
  {
    title: "Triage",
    shortcuts: [
      { keys: ["a"], description: "Keep and move on" },
      { keys: ["d"], description: "Dismiss and move on" },
      { keys: ["1", "2", "3", "4"], description: "Severity: critical, major, minor, suggestion" },
      { keys: ["u"], description: "Undo the last change" },
    ],
  },
  {
    title: "Edit",
    shortcuts: [
      { keys: ["e"], description: "Edit the comment" },
      { keys: ["n"], description: "New comment" },
      { keys: ["c"], description: "Show or hide the code" },
      { keys: ["⌘/Ctrl ↵"], description: "Save the edit" },
      { keys: ["Esc"], description: "Cancel the edit" },
    ],
  },
  {
    title: "Find and help",
    shortcuts: [
      { keys: ["/"], description: "Search" },
      { keys: ["?"], description: "This list" },
    ],
  },
];
