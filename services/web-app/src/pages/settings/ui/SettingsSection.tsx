/** Width of the left column that names each section and says what it is for. */
const LABEL_COLUMN_PX = 220;

const sectionStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: `${String(LABEL_COLUMN_PX)}px minmax(0, 1fr)`,
  columnGap: "var(--space-8)",
  rowGap: "var(--space-4)",
  paddingBlock: "var(--space-8)",
};

const labelColumnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-title)",
  fontWeight: "var(--fw-semibold)",
  lineHeight: "var(--lh-tight)",
  color: "var(--fg-0)",
};

const descriptionStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-control)",
  lineHeight: "var(--lh-body)",
  color: "var(--fg-2)",
};

const contentStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
  minWidth: 0,
};

export type SettingsSectionProps = {
  /** The heading's id: the section is named by it, and a control group inside can be too. */
  titleId: string;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
};

/** One settings topic: its name and purpose on the left, its controls on the right. */
export const SettingsSection = ({
  titleId,
  title,
  description,
  children,
}: SettingsSectionProps): React.ReactElement => (
  <section aria-labelledby={titleId} style={sectionStyle}>
    <div style={labelColumnStyle}>
      <h2 id={titleId} style={titleStyle}>
        {title}
      </h2>
      <p style={descriptionStyle}>{description}</p>
    </div>
    <div style={contentStyle}>{children}</div>
  </section>
);
