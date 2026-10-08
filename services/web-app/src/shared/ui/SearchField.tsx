export type SearchFieldProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  /** Shows a small spinner while a debounced search is pending or in flight. */
  isBusy?: boolean;
  isDisabled?: boolean;
};

const SearchIcon = (): React.ReactElement => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const SearchField = ({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  isBusy = false,
  isDisabled = false,
}: SearchFieldProps): React.ReactElement => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    onValueChange(event.target.value);
  };

  return (
    <div
      className="ui-focus-within"
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-2)",
        padding: "5px 8px",
        minWidth: 0,
        opacity: isDisabled ? 0.5 : 1,
      }}
    >
      <span style={{ color: "var(--fg-2)", flexShrink: 0, display: "flex" }}>
        <SearchIcon />
      </span>
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        aria-label={ariaLabel}
        disabled={isDisabled}
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          fontSize: 12,
          color: "var(--fg-0)",
          minWidth: 0,
        }}
      />
      {isBusy && (
        <span
          role="status"
          aria-label="Searching"
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            border: "1.5px solid var(--fg-3)",
            borderTopColor: "transparent",
            animation: "spin 0.6s linear infinite",
            flexShrink: 0,
          }}
        />
      )}
    </div>
  );
};
