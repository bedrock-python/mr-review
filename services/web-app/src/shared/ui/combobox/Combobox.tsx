import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@shared/lib";
import { Input } from "../field";
import { ICON_SIZE } from "../ICON_SIZE";

export type ComboboxProps = {
  /** The values to pick from, in order. */
  options: readonly string[];
  value: string;
  onValueChange: (value: string) => void;
  /**
   * A value that is not in the list may be typed: the list offers "Use “…”" first, Enter takes
   * it, and leaving the field keeps it.
   */
  allowsCustomValue?: boolean;
  /** Names the list for assistive tech ("Models"). The field itself is named by its Field. */
  listLabel: string;
  /** Shown in the list when there is nothing to pick. */
  emptyMessage?: string;
  placeholder?: string;
  /** Monospace, for ids, paths and model names. */
  isMono?: boolean;
  isDisabled?: boolean;
  /** For tests that read the field's value. */
  "data-testid"?: string;
  className?: string;
};

type Option = { id: string; value: string; label: string };

const LIST_MAX_HEIGHT_PX = 240;

/**
 * Pick one of a list or (with `allowsCustomValue`) type any other value — the ARIA editable
 * combobox with a listbox: `role="combobox"`, `aria-expanded`, `aria-controls`,
 * `aria-activedescendant`. The field shows the chosen value; focusing it selects the text.
 * Typing searches the list; ↑ ↓ move through it (opening it on the chosen value), Enter takes
 * the highlighted value, or the typed one when nothing is highlighted. Leaving the field keeps
 * a typed value; Escape drops it. Use inside a Field, which names it.
 */
export const Combobox = ({
  options: values,
  value,
  onValueChange,
  allowsCustomValue = false,
  listLabel,
  emptyMessage = "Nothing to pick",
  placeholder,
  isMono = false,
  isDisabled = false,
  "data-testid": testId,
  className,
}: ComboboxProps): React.ReactElement => {
  // What the user typed since opening the list; null while the field shows the chosen value.
  const [draft, setDraft] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  // The highlighted option, by index into `options`; -1 for none.
  const [activeIndex, setActiveIndex] = useState(-1);
  // A click that focuses the field selects its text, so typing replaces the value.
  const isSelectingOnMouseUp = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const typed = draft?.trim() ?? "";
  const matches =
    draft === null ? values : values.filter((v) => v.toLowerCase().includes(typed.toLowerCase()));
  const canUseTyped = allowsCustomValue && typed !== "" && !values.includes(typed);
  // A typed value that may be taken as it is: any, or only one of the list.
  const isTypedAcceptable = typed !== "" && (allowsCustomValue || values.includes(typed));
  const options: Option[] = [
    ...(canUseTyped ? [{ id: `${listId}-typed`, value: typed, label: `Use “${typed}”` }] : []),
    ...matches.map((v, i) => ({ id: `${listId}-${String(i)}`, value: v, label: v })),
  ];
  const activeOption = isOpen ? options[activeIndex] : undefined;

  // Keep the highlighted option in view while the arrows move through a long list.
  useEffect(() => {
    if (!activeOption) return;
    const list = listRef.current;
    const item = document.getElementById(activeOption.id);
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }, [activeOption]);

  const close = (): void => {
    setIsOpen(false);
    setDraft(null);
    setActiveIndex(-1);
  };

  const choose = (next: string): void => {
    onValueChange(next);
    close();
  };

  const open = (): void => {
    if (isOpen) return;
    setIsOpen(true);
    setActiveIndex(-1);
  };

  const move = (step: 1 | -1): void => {
    if (options.length === 0) return;
    if (!isOpen) {
      // Opening by arrow starts from the chosen value.
      setIsOpen(true);
      const current = options.findIndex((o) => o.value === value);
      setActiveIndex(current >= 0 ? current : 0);
      return;
    }
    setActiveIndex((index) => {
      if (index < 0) return step === 1 ? 0 : options.length - 1;
      return (index + step + options.length) % options.length;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    isSelectingOnMouseUp.current = false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter") {
      if (activeOption) {
        e.preventDefault();
        choose(activeOption.value);
      } else if (isTypedAcceptable) {
        e.preventDefault();
        choose(typed);
      }
    } else if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className={cn("ui-combobox", className)}>
      <Input
        type="text"
        role="combobox"
        isMono={isMono}
        {...(testId === undefined ? {} : { "data-testid": testId })}
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={activeOption?.id}
        disabled={isDisabled}
        placeholder={placeholder}
        value={draft ?? value}
        leadingIcon={<Search size={ICON_SIZE.inline} />}
        trailing={
          <ChevronDown
            size={ICON_SIZE.inline}
            aria-hidden="true"
            className="ui-combobox__chevron"
          />
        }
        onChange={(e) => {
          setDraft(e.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={(e) => {
          open();
          isSelectingOnMouseUp.current = true;
          e.currentTarget.select();
        }}
        onMouseUp={(e) => {
          if (!isSelectingOnMouseUp.current) return;
          isSelectingOnMouseUp.current = false;
          e.preventDefault();
          e.currentTarget.select();
        }}
        onClick={open}
        onBlur={() => {
          isSelectingOnMouseUp.current = false;
          // A typed value is what the user meant even if they never pressed Enter.
          if (isTypedAcceptable && typed !== value) choose(typed);
          else close();
        }}
        onKeyDown={handleKeyDown}
      />

      {/* Always in the DOM so aria-controls points at it; shown while open. */}
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={listLabel}
        hidden={!isOpen}
        className="ui-combobox__list"
        style={{ maxHeight: LIST_MAX_HEIGHT_PX }}
        // Keeps focus in the field, so picking an option or scrolling the list doesn't close it.
        onMouseDown={(e) => {
          e.preventDefault();
        }}
      >
        {isOpen &&
          options.map((option) => {
            const isSelected = option.value === value && option.label === option.value;
            return (
              <div
                key={option.id}
                id={option.id}
                role="option"
                aria-selected={isSelected}
                data-active={option.id === activeOption?.id || undefined}
                className={cn("ui-combobox__option", isMono && "ui-combobox__option--mono")}
                onClick={() => {
                  choose(option.value);
                }}
              >
                <span className="ui-combobox__check">
                  {isSelected && <Check size={ICON_SIZE.inline} aria-hidden="true" />}
                </span>
                <span className="ui-combobox__label">{option.label}</span>
              </div>
            );
          })}
        {isOpen && options.length === 0 && <p className="ui-combobox__empty">{emptyMessage}</p>}
      </div>
    </div>
  );
};
