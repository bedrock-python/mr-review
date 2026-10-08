export const SECTION_STYLE: React.CSSProperties = { marginBottom: 24 };

export const SECTION_TITLE_STYLE: React.CSSProperties = {
  margin: "0 0 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 400,
  color: "var(--fg-2)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

export const HINT_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: "var(--fg-2)",
  lineHeight: 1.5,
};

export const CHECKBOX_STYLE: React.CSSProperties = {
  accentColor: "var(--accent)",
  width: 13,
  height: 13,
  cursor: "pointer",
};

export const noticeStyle = (color: string): React.CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 5,
  border: `1px solid color-mix(in oklch, ${color} 35%, transparent)`,
  background: `color-mix(in oklch, ${color} 8%, var(--bg-2))`,
  fontSize: 11,
  color,
  lineHeight: 1.5,
});

/** A small toggle button (chip or segment) — selected state comes from `aria-pressed`. */
export const toggleChipStyle = (isPressed: boolean): React.CSSProperties => ({
  fontSize: 11,
  padding: "3px 9px",
  borderRadius: 999,
  border: `1px solid ${isPressed ? "var(--accent)" : "var(--border)"}`,
  background: isPressed ? "color-mix(in oklch, var(--accent) 12%, var(--bg-2))" : "var(--bg-2)",
  color: isPressed ? "var(--accent)" : "var(--fg-2)",
  cursor: "pointer",
  fontWeight: 500,
});
