import type { CSSProperties } from "react";

/** A card's content: its header, the fields, the actions, stacked with one rhythm. */
export const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
};

/** A row of check boxes or buttons that wraps when the column is narrow. */
export const inlineRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--space-2) var(--space-4)",
};

export const buttonRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--space-2)",
};

/** A fieldset of check boxes under an eyebrow legend, spaced like a RadioGroup. */
/** Two fields side by side: a passphrase and its repetition. */
export const twoColumnsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: "var(--space-3)",
  alignItems: "start",
};
