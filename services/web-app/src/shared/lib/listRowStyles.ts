// The row of a side list (review history, iterations): one look wherever such a list is drawn.

/** The open row: a raised fill and an accent bar on its leading edge. */
export const LIST_ROW_ACTIVE: React.CSSProperties = {
  background: "var(--bg-2)",
  boxShadow: "inset 2px 0 0 var(--accent)",
};

/** One line of a row: items in a row, allowed to shrink. */
export const LIST_ROW_LINE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  minWidth: 0,
};

/** The row's name: body size, medium weight. */
export const LIST_ROW_TITLE: React.CSSProperties = {
  fontSize: "var(--fs-body)",
  fontWeight: "var(--fw-medium)",
  color: "var(--fg-0)",
};

/** Paths, ids, times: mono meta in fg-2. */
export const LIST_ROW_META: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-meta)",
  color: "var(--fg-2)",
};

/** One line, cut with an ellipsis. */
export const TRUNCATE: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
