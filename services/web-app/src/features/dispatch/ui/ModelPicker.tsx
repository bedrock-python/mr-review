import { useEffect, useId, useRef, useState } from "react";

import { Check, ChevronDown, Search } from "lucide-react";

import { ICON_SIZE, Input } from "@shared/ui";

const LIST_MAX_HEIGHT_PX = 240;

export type ModelPickerProps = {
  models: string[];
  value: string;
  onChange: (model: string) => void;
  isDisabled: boolean;
};

type Option = { id: string; model: string; label: string };

/**
 * Pick one of the provider's models or type any other id — an editable combobox with a list.
 * The field shows the chosen model. Typing searches the list; the arrow keys move through it
 * and Enter takes the highlighted model, or the typed id when nothing is highlighted. Leaving
 * the field keeps a typed id; Escape drops it. Use inside a Field, which names it.
 */
export const ModelPicker = ({
  models,
  value,
  onChange,
  isDisabled,
}: ModelPickerProps): React.ReactElement => {
  // What the user typed since opening the list; null while the field shows the chosen model.
  const [draft, setDraft] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  // The highlighted option, by index into `options`; -1 for none.
  const [activeIndex, setActiveIndex] = useState(-1);
  // A click that focuses the field selects its text, so typing replaces the model id.
  const isSelectingOnMouseUp = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const typed = draft?.trim() ?? "";
  const matches =
    draft === null ? models : models.filter((m) => m.toLowerCase().includes(typed.toLowerCase()));
  const canUseTyped = typed !== "" && !models.includes(typed);
  const options: Option[] = [
    ...(canUseTyped ? [{ id: `${listId}-typed`, model: typed, label: `Use “${typed}”` }] : []),
    ...matches.map((m, i) => ({ id: `${listId}-${String(i)}`, model: m, label: m })),
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

  const choose = (model: string): void => {
    onChange(model);
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
      // Opening by arrow starts from the chosen model.
      setIsOpen(true);
      const current = options.findIndex((o) => o.model === value);
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
        choose(activeOption.model);
      } else if (typed) {
        e.preventDefault();
        choose(typed);
      }
    } else if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      close();
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <Input
        type="text"
        role="combobox"
        isMono
        data-testid="selected-model"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={activeOption?.id}
        disabled={isDisabled}
        placeholder="Search or type a model id…"
        value={draft ?? value}
        leadingIcon={<Search size={ICON_SIZE.inline} />}
        trailing={
          <ChevronDown
            size={ICON_SIZE.inline}
            aria-hidden="true"
            style={{ color: "var(--fg-2)", flexShrink: 0 }}
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
          // A typed id is what the user meant even if they never pressed Enter.
          if (typed && typed !== value) choose(typed);
          else close();
        }}
        onKeyDown={handleKeyDown}
      />

      {/* Always in the DOM so aria-controls points at it; shown while open. */}
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Models"
        hidden={!isOpen}
        // Keeps focus in the field, so picking an option or scrolling the list doesn't close it.
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        style={{
          position: "absolute",
          top: "calc(100% + var(--space-1))",
          left: 0,
          right: 0,
          zIndex: "var(--z-popover)",
          display: isOpen ? "flex" : "none",
          flexDirection: "column",
          padding: "var(--space-1)",
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--border-strong)",
          background: "var(--bg-1)",
          boxShadow: "var(--shadow-pop)",
          maxHeight: LIST_MAX_HEIGHT_PX,
          overflowY: "auto",
        }}
      >
        {isOpen &&
          options.map((option) => (
            <ModelOption
              key={option.id}
              id={option.id}
              label={option.label}
              isSelected={option.model === value && option.label === option.model}
              isActive={option.id === activeOption?.id}
              onSelect={() => {
                choose(option.model);
              }}
            />
          ))}
        {isOpen && options.length === 0 && (
          <p
            style={{
              margin: 0,
              padding: "var(--space-3)",
              fontSize: "var(--fs-control)",
              color: "var(--fg-2)",
              textAlign: "center",
            }}
          >
            No models configured — type a model id
          </p>
        )}
      </div>
    </div>
  );
};

type ModelOptionProps = {
  id: string;
  label: string;
  isSelected: boolean;
  /** Highlighted from the keyboard: Enter takes it. */
  isActive: boolean;
  onSelect: () => void;
};

const ModelOption = ({
  id,
  label,
  isSelected,
  isActive,
  onSelect,
}: ModelOptionProps): React.ReactElement => (
  <div
    id={id}
    role="option"
    aria-selected={isSelected}
    className={isActive ? undefined : "hover:bg-bg-hover"}
    onClick={onSelect}
    style={{
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)",
      flexShrink: 0,
      minHeight: "var(--control-md)",
      padding: "0 var(--space-2)",
      borderRadius: "var(--radius-control)",
      cursor: "pointer",
      background: isActive ? "var(--bg-3)" : undefined,
      boxShadow: isActive ? "inset var(--indicator-width) 0 0 var(--accent-fg)" : undefined,
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-control)",
      color: isSelected || isActive ? "var(--fg-0)" : "var(--fg-1)",
      fontWeight: isSelected ? "var(--fw-medium)" : "var(--fw-regular)",
    }}
  >
    <span style={{ display: "inline-flex", width: ICON_SIZE.inline, flexShrink: 0 }}>
      {isSelected && <Check size={ICON_SIZE.inline} aria-hidden="true" color="var(--accent-fg)" />}
    </span>
    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {label}
    </span>
  </div>
);
