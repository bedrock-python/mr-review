export type ThemeName = "ink" | "paper" | "phosphor";

const frameStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "var(--space-4) minmax(0, 1fr)",
  gridTemplateRows: "var(--space-3) minmax(0, 1fr)",
  height: "calc(var(--space-8) * 2)",
  overflow: "hidden",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-control)",
  background: "var(--bg-0)",
};

const barStyle: React.CSSProperties = {
  gridColumn: "1 / -1",
  background: "var(--bg-1)",
  borderBottom: "1px solid var(--border)",
};

const railStyle: React.CSSProperties = {
  background: "var(--bg-1)",
  borderRight: "1px solid var(--border)",
};

const bodyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
  padding: "var(--space-2)",
};

const line = (width: string, color: string): React.CSSProperties => ({
  width,
  height: "var(--space-1)",
  borderRadius: "var(--radius-pill)",
  background: color,
});

/**
 * A miniature of the app drawn in a theme's own tokens: `data-theme` on the frame makes every
 * `var(--…)` inside it resolve to that theme, whichever theme the page is in.
 */
export const ThemePreview = ({ theme }: { theme: ThemeName }): React.ReactElement => (
  <div data-theme={theme} aria-hidden="true" style={frameStyle}>
    <span style={barStyle} />
    <span style={railStyle} />
    <span style={bodyStyle}>
      <span style={line("70%", "var(--fg-2)")} />
      <span style={line("45%", "var(--border-strong)")} />
      <span style={line("85%", "var(--border-strong)")} />
      <span style={{ ...line("30%", "var(--accent)"), marginTop: "auto" }} />
    </span>
  </div>
);
