import { Card, EmptyState, Spinner } from "@shared/ui";

const statusRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  padding: "var(--space-3) var(--space-4)",
  fontSize: "var(--fs-control)",
  color: "var(--fg-2)",
};

const footerStyle: React.CSSProperties = { borderTop: "1px solid var(--border)" };

export type SettingsListProps = {
  /** Names the list for assistive tech: "Git hosts". */
  label: string;
  isLoading: boolean;
  /** Shown when loaded and there are no rows. */
  emptyTitle: string;
  emptyIcon: React.ReactNode;
  /** One `<li>` per record. */
  children: React.ReactNode[] | undefined;
  /** The add button, or the add form once it is open. */
  footer: React.ReactNode;
};

/** A card of configured records, one per row, with the way to add another at the bottom. */
export const SettingsList = ({
  label,
  isLoading,
  emptyTitle,
  emptyIcon,
  children,
  footer,
}: SettingsListProps): React.ReactElement => {
  const rows = children ?? [];
  return (
    <Card padding="none" style={{ overflow: "hidden" }}>
      {isLoading && (
        <div style={statusRowStyle}>
          <Spinner size="sm" tone="muted" isDecorative />
          Loading…
        </div>
      )}
      {!isLoading && rows.length === 0 && (
        <EmptyState size="sm" role="none" icon={emptyIcon} title={emptyTitle} />
      )}
      {rows.length > 0 && (
        <ul
          aria-label={label}
          className="divide-border divide-y"
          style={{ listStyle: "none", margin: 0, padding: 0 }}
        >
          {rows}
        </ul>
      )}
      <div style={footerStyle}>{footer}</div>
    </Card>
  );
};
