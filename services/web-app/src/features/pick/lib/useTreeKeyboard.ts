import { useRef, useState } from "react";
import type { FileTreeRow } from "./fileTree";

export type TreeRowProps = {
  ref: (element: HTMLElement | null) => void;
  tabIndex: 0 | -1;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
};

export type TreeKeyboard = {
  getRowProps: (row: FileTreeRow, index: number) => TreeRowProps;
};

export type UseTreeKeyboardParams = {
  rows: readonly FileTreeRow[];
  selectedPath: string | null;
  /** Enter or Space on a row: open a file, or open or close a folder. */
  onActivate: (row: FileTreeRow) => void;
  onToggleDir: (path: string) => void;
};

/**
 * The ARIA tree keyboard model over the visible rows: one tab stop, ↑/↓/Home/End move focus,
 * → opens a folder or steps into it, ← closes it or steps out to its parent, Enter and Space
 * activate. Moving focus does not open a file; the diff changes only on activation.
 */
export const useTreeKeyboard = ({
  rows,
  selectedPath,
  onActivate,
  onToggleDir,
}: UseTreeKeyboardParams): TreeKeyboard => {
  const elements = useRef(new Map<string, HTMLElement>());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  const isVisible = (path: string | null): path is string =>
    path !== null && rows.some((row) => row.path === path);
  let tabStop: string | null = rows[0]?.path ?? null;
  if (isVisible(selectedPath)) tabStop = selectedPath;
  if (isVisible(focusedPath)) tabStop = focusedPath;

  const focusRow = (index: number): void => {
    const row = rows[Math.min(Math.max(index, 0), rows.length - 1)];
    if (!row) return;
    setFocusedPath(row.path);
    elements.current.get(row.path)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>, index: number): void => {
    const row = rows[index];
    if (!row) return;
    const isDir = row.file === null;
    switch (event.key) {
      case "ArrowDown":
        focusRow(index + 1);
        break;
      case "ArrowUp":
        focusRow(index - 1);
        break;
      case "Home":
        focusRow(0);
        break;
      case "End":
        focusRow(rows.length - 1);
        break;
      case "ArrowRight":
        if (isDir && !row.isOpen) onToggleDir(row.path);
        else if (isDir) focusRow(index + 1);
        break;
      case "ArrowLeft":
        if (isDir && row.isOpen) onToggleDir(row.path);
        else if (row.parentPath !== null) {
          focusRow(rows.findIndex((candidate) => candidate.path === row.parentPath));
        }
        break;
      case "Enter":
      case " ":
        onActivate(row);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return {
    getRowProps: (row, index) => ({
      ref: (element) => {
        if (element) elements.current.set(row.path, element);
        else elements.current.delete(row.path);
      },
      tabIndex: row.path === tabStop ? 0 : -1,
      onKeyDown: (event) => {
        handleKeyDown(event, index);
      },
      onFocus: () => {
        setFocusedPath(row.path);
      },
    }),
  };
};
