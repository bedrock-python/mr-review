import { useRef } from "react";

export type RovingRadioItem<T extends string> = { value: T; isDisabled?: boolean };

export type RovingRadioItemProps = {
  ref: (element: HTMLElement | null) => void;
  role: "radio";
  "aria-checked": boolean;
  "aria-disabled": true | undefined;
  tabIndex: 0 | -1;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onClick: () => void;
};

/**
 * Which arrow keys move through the group. "horizontal" (a row: ← →) and "vertical" (a column:
 * ↑ ↓) leave the other pair to the page, for a list's own keys; "both" suits a grid that wraps.
 */
export type RovingRadioOrientation = "horizontal" | "vertical" | "both";

export type UseRovingRadioGroupParams<T extends string> = {
  items: readonly RovingRadioItem<T>[];
  value: T | undefined;
  onValueChange: (value: T) => void;
  /** Defaults to "both". */
  orientation?: RovingRadioOrientation;
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
 * cards): one tab stop, the arrow keys of `orientation` move focus and selection together and
 * wrap, Home and End jump to the ends, Space selects. Disabled items are skipped. Keys the
 * group does not use are not marked handled.
 */
export const useRovingRadioGroup = <T extends string>({
  items,
  value,
  onValueChange,
  orientation = "both",
}: UseRovingRadioGroupParams<T>): {
  getItemProps: (item: RovingRadioItem<T>) => RovingRadioItemProps;
} => {
  const elements = useRef(new Map<T, HTMLElement>());
  const enabled = items.filter((item) => item.isDisabled !== true).map((item) => item.value);
  const tabStop = value !== undefined && enabled.includes(value) ? value : enabled[0];

  const select = (target: T | undefined): void => {
    if (target === undefined) return;
    if (target !== value) onValueChange(target);
    elements.current.get(target)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>, from: T): void => {
    if (enabled.length === 0) return;
    const index = enabled.indexOf(from);
    let target: T | undefined;
    if (NEXT_KEYS[orientation].has(event.key)) target = enabled[(index + 1) % enabled.length];
    else if (PREVIOUS_KEYS[orientation].has(event.key))
      target = enabled[(index - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") target = enabled[0];
    else if (event.key === "End") target = enabled[enabled.length - 1];
    else if (event.key === " ") {
      // A disabled option can still hold focus (it was clicked); Space must not choose it.
      if (!enabled.includes(from)) {
        event.preventDefault();
        return;
      }
      target = from;
    } else return;
    event.preventDefault();
    select(target);
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
    onClick: () => {
      if (item.isDisabled !== true && item.value !== value) onValueChange(item.value);
    },
  });

  return { getItemProps };
};
