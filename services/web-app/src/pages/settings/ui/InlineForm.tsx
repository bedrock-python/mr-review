import { Button, SectionHeader } from "@shared/ui";

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-4)",
  padding: "var(--space-4)",
  background: "var(--bg-0)",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "var(--space-2)",
};

export type InlineFormProps = {
  /** The eyebrow over the fields. */
  title: string;
  /** The form's accessible name when the title alone is ambiguous ("Edit host GitLab"). */
  label?: string;
  /** Right end of the title row, e.g. the record's type. */
  aside?: React.ReactNode;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  children: React.ReactNode;
};

/** An add or edit form that opens in place inside a settings list, sunk below the rows. */
export const InlineForm = ({
  title,
  label,
  aside,
  submitLabel,
  isPending,
  onSubmit,
  onCancel,
  children,
}: InlineFormProps): React.ReactElement => (
  <form onSubmit={onSubmit} noValidate aria-label={label ?? title} style={formStyle}>
    <SectionHeader as="div" title={title} actions={aside} />
    {children}
    <div style={footerStyle}>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" isLoading={isPending}>
        {submitLabel}
      </Button>
    </div>
  </form>
);

export type FieldRowProps = {
  /** Relative widths of the two columns. */
  weights?: readonly [number, number];
  children: React.ReactNode;
};

/** Two fields side by side, top-aligned so a hint or error under one does not shift the other. */
export const FieldRow = ({ weights = [1, 1], children }: FieldRowProps): React.ReactElement => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `minmax(0, ${String(weights[0])}fr) minmax(0, ${String(weights[1])}fr)`,
      gap: "var(--space-3)",
      alignItems: "start",
    }}
  >
    {children}
  </div>
);
