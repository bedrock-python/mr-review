import { useState } from "react";
import {
  PresetEditor,
  useBuiltinPresets,
  useDeleteReviewPreset,
  useReviewPresets,
  useUpdateReviewPreset,
} from "@entities/review-preset";
import type { ReviewPreset } from "@entities/review-preset";

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
};

const INSTRUCTIONS_STYLE: React.CSSProperties = {
  margin: "6px 0 0",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--fg-2)",
  whiteSpace: "pre-wrap",
};

const countLabel = (brief: Record<string, unknown>): string => {
  const count = Object.keys(brief).length;
  return count === 0 ? "" : ` · sets ${String(count)} brief option${count === 1 ? "" : "s"}`;
};

const SavedPresetRow = ({ preset }: { preset: ReviewPreset }): React.ReactElement => {
  const updatePreset = useUpdateReviewPreset();
  const deletePreset = useDeleteReviewPreset();
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  if (isEditing) {
    return (
      <li style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <PresetEditor
          title={`Edit preset ${preset.name}`}
          submitLabel="Save changes"
          initial={{
            name: preset.name,
            description: preset.description,
            instructions: preset.instructions,
          }}
          isSaving={updatePreset.isPending}
          error={updatePreset.error?.message ?? null}
          onSubmit={(values) => {
            updatePreset.mutate(
              { id: preset.id, data: values },
              {
                onSuccess: () => {
                  setIsEditing(false);
                },
              }
            );
          }}
          onCancel={() => {
            updatePreset.reset();
            setIsEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li style={ROW_STYLE}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-0)" }}>{preset.name}</div>
        <div style={{ fontSize: 11, color: "var(--fg-2)" }}>
          {(preset.description || "No description") + countLabel(preset.brief_config)}
        </div>
        {preset.instructions && <pre style={INSTRUCTIONS_STYLE}>{preset.instructions}</pre>}
      </div>
      <button
        type="button"
        className="btn ghost"
        style={{ padding: "3px 8px", fontSize: 11 }}
        aria-label={`Edit preset ${preset.name}`}
        onClick={() => {
          setIsEditing(true);
        }}
      >
        Edit
      </button>
      <button
        type="button"
        className="btn ghost"
        style={{
          padding: "3px 8px",
          fontSize: 11,
          color: isConfirming ? "var(--c-critical-fg)" : undefined,
        }}
        aria-label={
          isConfirming ? `Confirm deleting preset ${preset.name}` : `Delete preset ${preset.name}`
        }
        disabled={deletePreset.isPending}
        onClick={() => {
          if (!isConfirming) {
            setIsConfirming(true);
            return;
          }
          deletePreset.mutate(preset.id);
        }}
      >
        {isConfirming ? "Confirm" : "Delete"}
      </button>
    </li>
  );
};

/** Saved review presets — edit or delete them — and the built-in ones, read-only. */
export const ReviewPresetsManager = (): React.ReactElement => {
  const { data: presets, isLoading } = useReviewPresets();
  const { data: builtins } = useBuiltinPresets();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ overflow: "hidden" }}>
        {isLoading && (
          <div style={{ padding: "12px 16px", color: "var(--fg-2)", fontSize: 12 }}>Loading…</div>
        )}
        {presets?.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: "var(--fg-2)", fontStyle: "italic" }}>
            No saved presets yet. Save one from a review&apos;s Brief with “Save as preset…”.
          </div>
        )}
        {presets && presets.length > 0 && (
          <ul
            aria-label="Saved review presets"
            style={{ listStyle: "none", margin: 0, padding: 0 }}
          >
            {presets.map((preset) => (
              <SavedPresetRow key={preset.id} preset={preset} />
            ))}
          </ul>
        )}
      </div>
      {builtins && (
        <details>
          <summary style={{ fontSize: 12, color: "var(--fg-2)", cursor: "pointer" }}>
            Built-in presets
          </summary>
          <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
            {builtins.map((preset) => (
              <li key={preset.id} style={{ ...ROW_STYLE, flexDirection: "column", gap: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-0)" }}>
                  {preset.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-2)" }}>{preset.description}</div>
                <pre style={INSTRUCTIONS_STYLE}>{preset.instructions}</pre>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};
