import { useState } from "react";

import { Button, Callout, Checkbox, Dialog } from "@shared/ui";

import { STRATEGY_LABELS, existingRecordCount, plural } from "../lib/importSummary";
import type { ImportPreview, MergeStrategy } from "@shared/api/export-import.api";

/** Rendered only while open, so the overwrite acknowledgement starts unchecked every time. */
type ImportConfirmDialogProps = {
  isPending: boolean;
  fileName: string;
  preview: ImportPreview;
  strategy: MergeStrategy;
  onConfirm: () => void;
  onCancel: () => void;
};

const effectOf = (strategy: MergeStrategy, existing: number): string => {
  const records = plural(existing, "record", "records");
  if (existing === 0) return "Nothing in the file exists here yet, so every record is added.";
  if (strategy === "skip") return `${records} already here will be left as they are.`;
  if (strategy === "merge") return `${records} already here will be updated from the file.`;
  return `${records} already here will be overwritten with the file's version.`;
};

export const ImportConfirmDialog = ({
  isPending,
  fileName,
  preview,
  strategy,
  onConfirm,
  onCancel,
}: ImportConfirmDialogProps): React.ReactElement => {
  const [isOverwriteAccepted, setIsOverwriteAccepted] = useState(false);
  const existing = existingRecordCount(preview);
  const isOverwriting = strategy === "replace" && existing > 0;
  const total =
    preview.hosts.total +
    preview.ai_providers.total +
    preview.review_presets.total +
    preview.reviews.total;
  const handleClose = (): void => {
    if (!isPending) onCancel();
  };

  return (
    <Dialog
      isOpen
      onClose={handleClose}
      title={isOverwriting ? "Replace existing data?" : "Import this file?"}
      description={
        <>
          {plural(total, "record", "records")} from {fileName}, strategy “
          {STRATEGY_LABELS[strategy]}”. {effectOf(strategy, existing)} Records that exist only here
          are never removed.
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={isOverwriting ? "danger" : "primary"}
            onClick={onConfirm}
            isLoading={isPending}
            disabled={isOverwriting && !isOverwriteAccepted}
          >
            {isOverwriting ? "Replace and import" : "Import"}
          </Button>
        </>
      }
    >
      {isOverwriting ? (
        <Callout tone="warn" size="sm" icon={null} role="none">
          <Checkbox
            label={`I understand that local changes to ${plural(existing, "record", "records")} will be lost.`}
            checked={isOverwriteAccepted}
            onCheckedChange={setIsOverwriteAccepted}
          />
        </Callout>
      ) : undefined}
    </Dialog>
  );
};
