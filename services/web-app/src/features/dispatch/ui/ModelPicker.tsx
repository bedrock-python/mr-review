import { useEffect, useRef, useState } from "react";

export type ModelPickerProps = {
  models: string[];
  value: string;
  onChange: (model: string) => void;
  isDisabled: boolean;
  accentColor: string;
};

/**
 * Pick one of the provider's models or type any other id: Enter, or the "Use …" entry, takes the
 * typed text as the model.
 */
export const ModelPicker = ({
  models,
  value,
  onChange,
  isDisabled,
  accentColor,
}: ModelPickerProps): React.ReactElement => {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (!dropRef.current?.contains(target) && !inputRef.current?.contains(target)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const typed = search.trim();
  const matches = models.filter((m) => m.toLowerCase().includes(typed.toLowerCase()));
  const canUseTyped = typed !== "" && !models.includes(typed);

  const choose = (model: string): void => {
    onChange(model);
    setIsOpen(false);
    setSearch("");
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderRadius: 8,
          border: `1.5px solid ${isOpen ? accentColor : "var(--border)"}`,
          background: "var(--bg-1)",
          padding: "0 10px",
          transition: "border-color 0.1s",
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ flexShrink: 0, color: "var(--fg-3)" }}
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          aria-label="Model"
          disabled={isDisabled}
          placeholder={value ? "Search or type a model id…" : "Type a model id…"}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && typed) {
              e.preventDefault();
              choose(typed);
            } else if (e.key === "Escape") {
              setIsOpen(false);
              setSearch("");
            }
          }}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            color: "var(--fg-0)",
            padding: "9px 0",
            cursor: isDisabled ? "not-allowed" : "text",
          }}
        />
        {value && !search && (
          <span
            data-testid="selected-model"
            style={{
              fontSize: 11,
              color: "var(--fg-2)",
              flexShrink: 0,
              fontFamily: "var(--font-mono)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 260,
            }}
          >
            {value}
          </span>
        )}
      </div>

      {isOpen && (
        <div
          ref={dropRef}
          role="listbox"
          aria-label="Models"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 100,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg-1)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {canUseTyped && (
            <ModelOption
              label={`Use “${typed}”`}
              isSelected={false}
              accentColor={accentColor}
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
              accentColor={accentColor}
              onSelect={() => {
                choose(m);
              }}
            />
          ))}
          {matches.length === 0 && !canUseTyped && (
            <div style={{ padding: 12, fontSize: 12, color: "var(--fg-3)", textAlign: "center" }}>
              No models configured — type a model id
            </div>
          )}
        </div>
      )}
    </div>
  );
};

type ModelOptionProps = {
  label: string;
  isSelected: boolean;
  accentColor: string;
  onSelect: () => void;
};

const ModelOption = ({
  label,
  isSelected,
  accentColor,
  onSelect,
}: ModelOptionProps): React.ReactElement => (
  <button
    type="button"
    role="option"
    aria-selected={isSelected}
    onMouseDown={(e) => {
      e.preventDefault();
      onSelect();
    }}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      width: "100%",
      padding: "8px 12px",
      background: isSelected
        ? `color-mix(in oklch, ${accentColor} 10%, var(--bg-0))`
        : "transparent",
      border: "none",
      cursor: "pointer",
      textAlign: "left",
    }}
  >
    <span style={{ width: 12, flexShrink: 0, color: accentColor }} aria-hidden="true">
      {isSelected ? "✓" : ""}
    </span>
    <span
      style={{
        fontSize: 13,
        fontFamily: "var(--font-mono)",
        color: isSelected ? "var(--fg-0)" : "var(--fg-1)",
        fontWeight: isSelected ? 600 : 400,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  </button>
);
