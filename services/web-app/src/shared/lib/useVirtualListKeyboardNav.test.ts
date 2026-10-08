import { describe, expect, it } from "vitest";
import { findNextFocusableIndex } from "./useVirtualListKeyboardNav";

// Rows 0 and 4 are a label and a divider (not focusable), as in the repository list.
const FOCUSABLE = [false, true, true, true, false, true, true];
const isFocusable = (index: number): boolean => FOCUSABLE[index] ?? false;
const next = (key: string, current: number): number =>
  findNextFocusableIndex(key, current, FOCUSABLE.length, isFocusable);

describe("findNextFocusableIndex", () => {
  it("steps over rows that cannot take focus", () => {
    expect(next("ArrowDown", 3)).toBe(5);
    expect(next("ArrowUp", 5)).toBe(3);
  });

  it("goes to the first and last focusable rows on Home and End", () => {
    expect(next("Home", 5)).toBe(1);
    expect(next("End", 1)).toBe(6);
  });

  it("stays put at either end", () => {
    expect(next("ArrowUp", 1)).toBe(1);
    expect(next("ArrowDown", 6)).toBe(6);
  });

  it("treats every row as focusable by default", () => {
    expect(findNextFocusableIndex("ArrowDown", 3, 7)).toBe(4);
    expect(findNextFocusableIndex("Home", 3, 7)).toBe(0);
  });
});
