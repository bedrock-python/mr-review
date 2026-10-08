import { useId, useRef, useState } from "react";

import { Check, ChevronDown, Search } from "lucide-react";

import { ICON_SIZE, Input } from "@shared/ui";

const LIST_MAX_HEIGHT_PX = 240;

export type ModelPickerProps = {
  models: string[];
  value: string;
  onChange: (model: string) => void;
  isDisabled: boolean;
};

/**
 * Pick one of the provider's models or type any other id. The field shows the chosen model;
 * typing searches the list, and Enter, or the "Use …" entry, takes the typed text as the model.
 * Escape and leaving the field drop the search. Use inside a Field, which names it.
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
  // A click that focuses the field selects its text, so typing replaces the model id.
  const isSelectingOnMouseUp = useRef(false);
  const listId = useId();

  const typed = draft?.trim() ?? "";
  const matches =
    draft === null ? models : models.filter((m) => m.toLowerCase().includes(typed.toLowerCase()));
  const canUseTyped = typed !== "" && !models.includes(typed);

  const close = (): void => {
    setIsOpen(false);
    setDraft(null);
  };

  const choose = (model: string): void => {
    onChange(model);
    close();
  };

  return (
    <div style={{ position: "relative" }}>
      <Input
        type="text"
        isMono
        data-testid="selected-model"
        autoComplete="off"
        spellCheck={false}
        aria-controls={isOpen ? listId : undefined}
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
        }}
        onFocus={(e) => {
          setIsOpen(true);
          isSelectingOnMouseUp.current = true;
          e.currentTarget.select();
        }}
        onMouseUp={(e) => {
          if (!isSelectingOnMouseUp.current) return;
          isSelectingOnMouseUp.current = false;
          e.preventDefault();
          e.currentTarget.select();
        }}
        onClick={() => {
          // Reopens the list after Escape closed it with the focus still here.
          setIsOpen(true);
        }}
        onBlur={() => {
          isSelectingOnMouseUp.current = false;
          close();
        }}
        onKeyDown={(e) => {
          isSelectingOnMouseUp.current = false;
          if (e.key === "Enter" && typed) {
            e.preventDefault();
            choose(typed);
          } else if (e.key === "Escape") {
            close();
          }
        }}
      />

      {isOpen && (
        <div
          id={listId}
          role="listbox"
          aria-label="Models"
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
            display: "flex",
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
          {canUseTyped && (
            <ModelOption
              label={`Use “${typed}”`}
              isSelected={false}
              onSelect={() => {
                choose(typed);
              }}
            />
          )}
          {matches.map((m) => (
            <ModelOption
              key={m}
              label={m}
              isSelected={m === value}
              onSelect={() => {
                choose(m);
              }}
            />
          ))}
          {matches.length === 0 && !canUseTyped && (
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
      )}
    </div>
  );
};

type ModelOptionProps = {
  label: string;
  isSelected: boolean;
  onSelect: () => void;
};

const ModelOption = ({ label, isSelected, onSelect }: ModelOptionProps): React.ReactElement => (
  <button
    type="button"
    role="option"
    aria-selected={isSelected}
    tabIndex={-1}
    className="hover:bg-bg-hover"
    onClick={onSelect}
    style={{
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)",
      width: "100%",
      minHeight: "var(--control-md)",
      padding: "0 var(--space-2)",
      borderRadius: "var(--radius-control)",
      textAlign: "left",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-control)",
      color: isSelected ? "var(--fg-0)" : "var(--fg-1)",
      fontWeight: isSelected ? "var(--fw-medium)" : "var(--fw-regular)",
    }}
  >
    <span style={{ display: "inline-flex", width: ICON_SIZE.inline, flexShrink: 0 }}>
      {isSelected && <Check size={ICON_SIZE.inline} aria-hidden="true" color="var(--accent-fg)" />}
    </span>
    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {label}
    </span>
  </button>
);
