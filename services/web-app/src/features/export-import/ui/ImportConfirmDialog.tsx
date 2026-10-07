import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { STRATEGY_LABELS, existingRecordCount, plural } from "../lib/importSummary";
import { buttonRowStyle, choiceStyle, hintStyle, warningStyle } from "./styles";
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

const contentStyle: React.CSSProperties = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: 201,
  width: 440,
  maxWidth: "calc(100vw - 32px)",
  padding: "18px 20px",
  background: "var(--bg-1)",
  border: "1px solid var(--border)",
  borderRadius: 10,
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
  const total = preview.hosts.total + preview.ai_providers.total + preview.reviews.total;
  const confirmLabel = isOverwriting ? "Replace and import" : "Import";

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200 }}
        />
        <Dialog.Content style={contentStyle}>
          <Dialog.Title style={{ fontSize: 15, fontWeight: 700, color: "var(--fg-0)", margin: 0 }}>
            {isOverwriting ? "Replace existing data?" : "Import this file?"}
          </Dialog.Title>
          <Dialog.Description style={{ ...hintStyle, margin: "6px 0 12px", fontSize: 12 }}>
            {plural(total, "record", "records")} from {fileName}, strategy “
            {STRATEGY_LABELS[strategy]}”. {effectOf(strategy, existing)} Records that exist only
            here are never removed.
          </Dialog.Description>

          {isOverwriting && (
            <div style={{ ...warningStyle, marginBottom: 12 }}>
              <label style={choiceStyle}>
                <input
                  type="checkbox"
                  checked={isOverwriteAccepted}
                  onChange={(e) => {
                    setIsOverwriteAccepted(e.target.checked);
                  }}
                />
                I understand that local changes to {plural(existing, "record", "records")} will be
                lost.
              </label>
            </div>
          )}

          <div style={{ ...buttonRowStyle, justifyContent: "flex-end" }}>
            <Dialog.Close asChild>
              <button type="button" className="btn ghost" disabled={isPending}>
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="btn primary"
              onClick={onConfirm}
              disabled={isPending || (isOverwriting && !isOverwriteAccepted)}
            >
              {isPending ? "Importing…" : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
