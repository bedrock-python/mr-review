import { useCallback, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

export const SEARCH_DEBOUNCE_MS = 300;

export type DebouncedSearch = {
  /** Raw input value, updated on every keystroke. */
  value: string;
  /** Trimmed value, committed after the user pauses typing. */
  debouncedValue: string;
  /** True while a typed value is waiting to be committed. */
  isPending: boolean;
  setValue: (next: string) => void;
};

/**
 * Search box state with a debounced committed value. Clearing the box commits
 * immediately so the unfiltered list comes back without the debounce delay.
 */
export const useDebouncedSearch = (delayMs: number = SEARCH_DEBOUNCE_MS): DebouncedSearch => {
  const [value, setRawValue] = useState("");
  const [debouncedValue, setDebouncedValue] = useState("");
  const commit = useDebouncedCallback((next: string): void => {
    setDebouncedValue(next);
  }, delayMs);

  const setValue = useCallback(
    (next: string): void => {
      setRawValue(next);
      const trimmed = next.trim();
      if (trimmed === "") {
        commit.cancel();
        setDebouncedValue("");
        return;
      }
      commit(trimmed);
    },
    [commit]
  );

  return { value, debouncedValue, isPending: value.trim() !== debouncedValue, setValue };
};
