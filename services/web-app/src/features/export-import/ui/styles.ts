import type { CSSProperties } from "react";

export const panelStyle: CSSProperties = { padding: "14px 16px" };

export const headingStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--fg-0)",
  margin: "0 0 10px",
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--fg-2)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  marginBottom: 6,
};

export const inputStyle: CSSProperties = {
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  color: "var(--fg-0)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

export const choiceStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  fontSize: 12,
  cursor: "pointer",
  color: "var(--fg-1)",
};

export const hintStyle: CSSProperties = { margin: "2px 0 0", fontSize: 11, color: "var(--fg-3)" };

export const warningStyle: CSSProperties = {
  margin: "8px 0 0",
  padding: "8px 10px",
  fontSize: 11,
  color: "var(--fg-1)",
  background: "var(--bg-2)",
  borderLeft: "3px solid var(--c-major)",
  borderRadius: 4,
};

export const errorStyle: CSSProperties = {
  margin: "8px 0 0",
  padding: "8px 10px",
  fontSize: 12,
  color: "var(--fg-0)",
  background: "var(--bg-2)",
  borderLeft: "3px solid var(--c-critical)",
  borderRadius: 4,
};

export const cardStyle: CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  background: "var(--bg-2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 12,
  color: "var(--fg-1)",
};

export const buttonRowStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
