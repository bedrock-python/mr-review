import { useRef, useState } from "react";

export type RovingRadioItem<T extends string> = { value: T; isDisabled?: boolean };

export type RovingRadioItemProps = {
  ref: (element: HTMLElement | null) => void;
  role: "radio";
  "aria-checked": boolean;
  "aria-disabled": true | undefined;
  tabIndex: 0 | -1;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onClick: () => void;
};

/**
 * Which arrow keys move through the group. "horizontal" (a row: ← →) and "vertical" (a column:
 * ↑ ↓) leave the other pair to the page, for a list's own keys; "both" suits a grid that wraps.
 */
export type RovingRadioOrientation = "horizontal" | "vertical" | "both";

/**
 * When a radio is chosen. "automatic" (the ARIA default): the arrow keys move focus and the
 * choice together. "manual": the arrow keys only move focus; Space or Enter (or a click)
 * chooses. Use manual when choosing does something costly or hard to undo — it overwrites
 * settings, starts a request, discards a draft — so passing over an option on the way to
 * another must not choose it.
 */
export type RovingRadioActivation = "automatic" | "manual";

export type UseRovingRadioGroupParams<T extends string> = {
  items: readonly RovingRadioItem<T>[];
  value: T | undefined;
  onValueChange: (value: T) => void;
  /** Defaults to "both". */
  orientation?: RovingRadioOrientation;
  /** Defaults to "automatic". */
  activation?: RovingRadioActivation;
};

const NEXT_KEYS: Record<RovingRadioOrientation, ReadonlySet<string>> = {
  horizontal: new Set(["ArrowRight"]),
  vertical: new Set(["ArrowDown"]),
  both: new Set(["ArrowRight", "ArrowDown"]),
};
const PREVIOUS_KEYS: Record<RovingRadioOrientation, ReadonlySet<string>> = {
  horizontal: new Set(["ArrowLeft"]),
  vertical: new Set(["ArrowUp"]),
  both: new Set(["ArrowLeft", "ArrowUp"]),
};

/**
 * The ARIA radio-group keyboard model for custom radios (segmented controls, selectable
 * cards): one tab stop, the arrow keys of `orientation` move (and, with automatic activation,
 * select) and wrap, Home and End jump to the ends, Space selects — Enter too, with manual
 * activation. Disabled items are skipped. Keys the group does not use are not marked handled.
 */
export const useRovingRadioGroup = <T extends string>({
  items,
  value,
  onValueChange,
  orientation = "both",
  activation = "automatic",
}: UseRovingRadioGroupParams<T>): {
  getItemProps: (item: RovingRadioItem<T>) => RovingRadioItemProps;
} => {
  const elements = useRef(new Map<T, HTMLElement>());
  // With manual activation focus can rest on an option that is not chosen: it holds the tab
  // stop while it has focus; once focus leaves the group, the chosen option has it again.
  const [focused, setFocused] = useState<T | undefined>(undefined);
  const enabled = items.filter((item) => item.isDisabled !== true).map((item) => item.value);
  const isFocusedStop =
    activation === "manual" && focused !== undefined && enabled.includes(focused);
  const fallback = value !== undefined && enabled.includes(value) ? value : enabled[0];
  const tabStop = isFocusedStop ? focused : fallback;

  const choose = (target: T): void => {
    if (target !== value) onValueChange(target);
  };

  const moveTo = (target: T | undefined): void => {
    if (target === undefined) return;
    if (activation === "automatic") choose(target);
    elements.current.get(target)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>, from: T): void => {
    if (enabled.length === 0) return;
    const index = enabled.indexOf(from);
    const isChooseKey = event.key === " " || (activation === "manual" && event.key === "Enter");
    if (isChooseKey) {
      event.preventDefault();
      // A disabled option can still hold focus (it was clicked); the key must not choose it.
      if (enabled.includes(from)) choose(from);
      return;
    }
    let target: T | undefined;
    if (NEXT_KEYS[orientation].has(event.key)) target = enabled[(index + 1) % enabled.length];
    else if (PREVIOUS_KEYS[orientation].has(event.key))
      target = enabled[(index - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") target = enabled[0];
    else if (event.key === "End") target = enabled[enabled.length - 1];
    else return;
    event.preventDefault();
    moveTo(target);
  };

  const getItemProps = (item: RovingRadioItem<T>): RovingRadioItemProps => ({
    ref: (element) => {
      if (element) elements.current.set(item.value, element);
      else elements.current.delete(item.value);
    },
    role: "radio",
    "aria-checked": item.value === value,
    "aria-disabled": item.isDisabled === true ? true : undefined,
    tabIndex: item.value === tabStop ? 0 : -1,
    onKeyDown: (event) => {
      handleKeyDown(event, item.value);
    },
    onFocus: () => {
      if (activation === "manual") setFocused(item.value);
    },
    onBlur: () => {
      if (activation === "manual") setFocused(undefined);
    },
    onClick: () => {
      if (item.isDisabled !== true) choose(item.value);
    },
  });

  return { getItemProps };
};
