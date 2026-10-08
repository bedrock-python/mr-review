/** The left column: what is posted where, or what became of it. The preview takes the rest. */
export const ASIDE_WIDTH_PX = 400;

export const ASIDE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-5)",
  minHeight: 0,
  overflow: "auto",
  padding: "var(--space-5)",
  borderRight: "1px solid var(--border)",
};

export const STAGE_TITLE: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-title)",
  fontWeight: "var(--fw-semibold)",
  lineHeight: "var(--lh-tight)",
  color: "var(--fg-0)",
};

export const STAGE_SUBTITLE: React.CSSProperties = {
  margin: "var(--space-1) 0 0",
  fontSize: "var(--fs-control)",
  lineHeight: "var(--lh-body)",
  color: "var(--fg-2)",
};

export const SECTION: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

export const MONO_META: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-meta)",
  color: "var(--fg-2)",
};

export const TRUNCATE: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
