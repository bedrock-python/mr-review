export type ShortcutDescription = {
  keys: readonly string[];
  description: string;
};

export const TRIAGE_SHORTCUTS: readonly ShortcutDescription[] = [
  { keys: ["j", "↓"], description: "Next comment" },
  { keys: ["k", "↑"], description: "Previous comment" },
  { keys: ["a"], description: "Keep and move on" },
  { keys: ["d"], description: "Dismiss and move on" },
  { keys: ["e"], description: "Edit the comment" },
  { keys: ["1", "2", "3", "4"], description: "Severity: critical, major, minor, suggestion" },
  { keys: ["c"], description: "Show or hide the code context" },
  { keys: ["n"], description: "New comment" },
  { keys: ["/"], description: "Search" },
  { keys: ["u"], description: "Undo the last change" },
  { keys: ["⌘/Ctrl", "↵"], description: "Save the edit" },
  { keys: ["Esc"], description: "Cancel the edit" },
  { keys: ["?"], description: "This list" },
];
