import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button, Dialog, ICON_SIZE } from "@shared/ui";

const rowStyle: React.CSSProperties = {
  display: "grid",
  columnGap: "var(--space-3)",
  rowGap: "var(--space-2)",
  alignItems: "center",
  padding: "var(--space-3) var(--space-4)",
};

const headStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  minWidth: 0,
  minHeight: "var(--control-sm)",
};

const iconStyle: React.CSSProperties = { display: "inline-flex", gridRow: 1 };

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: "var(--space-1)",
  gridRow: 1,
  justifySelf: "end",
};

export type SettingsRowProps = {
  /** An identity icon before the name. */
  icon?: React.ReactNode;
  /** The first line: name, type badge, small facts. */
  head: React.ReactNode;
  /** Under the first line: the address, the models, a warning. */
  details?: React.ReactNode;
  /** Right end of the first line. */
  actions: React.ReactNode;
};

/** One configured record in a settings list. */
export const SettingsRow = ({
  icon,
  head,
  details,
  actions,
}: SettingsRowProps): React.ReactElement => {
  const hasIcon = icon !== undefined;
  const contentColumn = hasIcon ? 2 : 1;
  return (
    <div
      style={{
        ...rowStyle,
        gridTemplateColumns: hasIcon ? "auto minmax(0, 1fr) auto" : "minmax(0, 1fr) auto",
      }}
    >
      {hasIcon && <span style={iconStyle}>{icon}</span>}
      <div style={{ ...headStyle, gridColumn: contentColumn, gridRow: 1 }}>{head}</div>
      <div style={{ ...actionsStyle, gridColumn: contentColumn + 1 }}>{actions}</div>
      {details !== undefined && (
        // Under the actions too: the models and the address get the row's full width.
        <div style={{ gridColumn: `${String(contentColumn)} / -1`, gridRow: 2, minWidth: 0 }}>
          {details}
        </div>
      )}
    </div>
  );
};

export type RowActionsProps = {
  /** The record's name, for the buttons' accessible names and the confirmation. */
  name: string;
  /** "host", "provider": completes "Remove host". */
  kind: string;
  /** What removing deletes and what stays, said before it happens. */
  consequence: string;
  isRemoving: boolean;
  onEdit: () => void;
  onRemove: () => void;
};

/** Edit and Remove for a settings row; Remove asks first. */
export const RowActions = ({
  name,
  kind,
  consequence,
  isRemoving,
  onEdit,
  onRemove,
}: RowActionsProps): React.ReactElement => {
  const [isConfirming, setIsConfirming] = useState(false);
  const close = (): void => {
    if (!isRemoving) setIsConfirming(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<Pencil size={ICON_SIZE.inline} aria-hidden="true" />}
        aria-label={`Edit ${name}`}
        onClick={onEdit}
      >
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon={<Trash2 size={ICON_SIZE.inline} aria-hidden="true" />}
        aria-label={`Remove ${name}`}
        style={{ color: "var(--c-danger-fg)" }}
        onClick={() => {
          setIsConfirming(true);
        }}
      >
        Remove
      </Button>
      <Dialog
        isOpen={isConfirming}
        onClose={close}
        size="sm"
        title={`Remove ${name}?`}
        description={consequence}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={isRemoving}>
              Cancel
            </Button>
            <Button variant="danger" isLoading={isRemoving} onClick={onRemove}>
              Remove {kind}
            </Button>
          </>
        }
      />
    </>
  );
};
