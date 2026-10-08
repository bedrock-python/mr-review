import type { SeverityLabel } from "@entities/review";

export const SectionHeader = ({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}): React.ReactElement => (
  <div style={{ padding: "20px 24px 14px" }}>
    <div
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 15,
        fontWeight: 600,
        color: "var(--fg-0)",
        marginBottom: hint ? 4 : 0,
      }}
    >
      {title}
    </div>
    {hint && (
      <div className="dim" style={{ fontSize: 12 }}>
        {hint}
      </div>
    )}
  </div>
);

export const SummaryRow = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement => (
  <div
    style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12.5 }}
  >
    <span className="dim">{label}</span>
    <span className="mono">{children}</span>
  </div>
);

export const Stat = ({ label, value }: { label: string; value: number }): React.ReactElement => (
  <div
    style={{
      flex: 1,
      padding: "12px 8px",
      background: "var(--bg-2)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-3)",
      textAlign: "center",
    }}
  >
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 22,
        fontWeight: 600,
        color: "var(--fg-0)",
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 10,
        color: "var(--fg-2)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginTop: 2,
      }}
    >
      {label}
    </div>
  </div>
);

export const ButtonSpinner = (): React.ReactElement => (
  <div
    style={{
      width: 13,
      height: 13,
      borderRadius: "50%",
      border: "2px solid var(--accent-ink)",
      borderTopColor: "transparent",
    }}
    className="animate-spin"
  />
);

const SEVERITY_LABEL_OPTIONS: { value: SeverityLabel; text: string }[] = [
  { value: "bold", text: "**Major** · …" },
  { value: "tag", text: "[major] …" },
  { value: "off", text: "No label" },
];

const OPTION_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 12px",
  background: "var(--bg-1)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-3)",
  fontSize: 12.5,
};

export type PostOptionsProps = {
  fallbackToGeneralNote: boolean;
  onFallbackChange: (value: boolean) => void;
  severityLabel: SeverityLabel;
  onSeverityLabelChange: (value: SeverityLabel) => void;
};

export const PostOptions = ({
  fallbackToGeneralNote,
  onFallbackChange,
  severityLabel,
  onSeverityLabelChange,
}: PostOptionsProps): React.ReactElement => (
  <div style={{ margin: "0 24px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
    <label style={{ ...OPTION_ROW_STYLE, cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={fallbackToGeneralNote}
        onChange={(e) => {
          onFallbackChange(e.target.checked);
        }}
        style={{ accentColor: "var(--accent)" }}
      />
      <span>Fall back to general note if inline comment can&apos;t anchor</span>
    </label>
    <label style={OPTION_ROW_STYLE}>
      <span style={{ flex: 1 }}>Severity label on each comment</span>
      <select
        className="mono"
        value={severityLabel}
        onChange={(e) => {
          const option = SEVERITY_LABEL_OPTIONS.find((o) => o.value === e.target.value);
          if (option) onSeverityLabelChange(option.value);
        }}
        style={{
          background: "var(--bg-2)",
          color: "var(--fg-0)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-2)",
          padding: "3px 6px",
          fontSize: 12,
        }}
      >
        {SEVERITY_LABEL_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
      </select>
    </label>
  </div>
);
