/** The record's name in a settings row: sans, medium, cut with an ellipsis when long. */
export const rowNameStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "var(--fs-body)",
  fontWeight: "var(--fw-medium)",
  color: "var(--fg-0)",
};

/** Small facts after the name: "6 models". */
export const rowMetaStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: "var(--fs-meta)",
  color: "var(--fg-2)",
  whiteSpace: "nowrap",
};

/** Lines a checkbox or swatches up with the 30px inputs next to them in a FieldRow. */
export const controlHeightStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  minHeight: "var(--control-md)",
};

/** The row at the bottom of a settings list that holds its "Add …" button. */
export const addRowStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-3)",
};

/** A field and the note that belongs to it (a warning about its value), kept close together. */
export const fieldWithNoteStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};
