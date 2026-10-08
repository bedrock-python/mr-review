import { useState } from "react";
import { Bookmark, Pencil, Trash2 } from "lucide-react";
import {
  PresetEditor,
  useBuiltinPresets,
  useDeleteReviewPreset,
  useReviewPresets,
  useUpdateReviewPreset,
} from "@entities/review-preset";
import { Button, Card, Disclosure, EmptyState, ICON_SIZE, Spinner } from "@shared/ui";
import type { ReviewPreset } from "@entities/review-preset";

const ROW_STYLE: React.CSSProperties = { padding: "var(--space-3) var(--space-4)" };

const NAME_STYLE: React.CSSProperties = {
  fontSize: "var(--fs-body)",
  fontWeight: "var(--fw-semibold)",
};

const META_STYLE: React.CSSProperties = { fontSize: "var(--fs-meta)" };

const INSTRUCTIONS_STYLE: React.CSSProperties = {
  margin: "var(--space-2) 0 0",
  fontSize: "var(--fs-meta)",
  lineHeight: "var(--lh-body)",
};

const icon = (Icon: typeof Pencil): React.ReactNode => (
  <Icon size={ICON_SIZE.inline} aria-hidden="true" />
);

const countLabel = (brief: Record<string, unknown>): string => {
  const count = Object.keys(brief).length;
  return count === 0 ? "" : ` · sets ${String(count)} brief option${count === 1 ? "" : "s"}`;
};

const Instructions = ({ children }: { children: string }): React.ReactElement => (
  <pre className="text-fg-2 font-mono whitespace-pre-wrap" style={INSTRUCTIONS_STYLE}>
    {children}
  </pre>
);

const SavedPresetRow = ({ preset }: { preset: ReviewPreset }): React.ReactElement => {
  const updatePreset = useUpdateReviewPreset();
  const deletePreset = useDeleteReviewPreset();
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  if (isEditing) {
    return (
      <li className="border-border border-b last:border-b-0" style={ROW_STYLE}>
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
    <li
      className="border-border flex items-start border-b last:border-b-0"
      style={{ ...ROW_STYLE, gap: "var(--space-3)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-fg-0" style={NAME_STYLE}>
          {preset.name}
        </div>
        <div className="text-fg-2" style={META_STYLE}>
          {(preset.description || "No description") + countLabel(preset.brief_config)}
        </div>
        {preset.instructions && <Instructions>{preset.instructions}</Instructions>}
      </div>
      <div className="flex shrink-0" style={{ gap: "var(--space-1)" }}>
        <Button
          variant="ghost"
          size="sm"
          icon={icon(Pencil)}
          aria-label={`Edit preset ${preset.name}`}
          onClick={() => {
            setIsEditing(true);
          }}
        >
          Edit
        </Button>
        <Button
          variant={isConfirming ? "danger" : "ghost"}
          size="sm"
          icon={icon(Trash2)}
          isLoading={deletePreset.isPending}
          aria-label={
            isConfirming ? `Confirm deleting preset ${preset.name}` : `Delete preset ${preset.name}`
          }
          onClick={() => {
            if (!isConfirming) {
              setIsConfirming(true);
              return;
            }
            deletePreset.mutate(preset.id);
          }}
        >
          {isConfirming ? "Confirm" : "Delete"}
        </Button>
      </div>
    </li>
  );
};

/** Saved review presets — edit or delete them — and the built-in ones, read-only. */
export const ReviewPresetsManager = (): React.ReactElement => {
  const { data: presets, isLoading } = useReviewPresets();
  const { data: builtins } = useBuiltinPresets();

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
      <Card padding="none" className="overflow-hidden">
        {isLoading && (
          <div className="flex justify-center" style={ROW_STYLE}>
            <Spinner size="sm" label="Loading presets" />
          </div>
        )}
        {presets?.length === 0 && (
          <EmptyState
            size="sm"
            icon={<Bookmark size={ICON_SIZE.inline} />}
            title="No saved presets yet"
            description="Save one from a review's Brief with “Save as preset…”."
          />
        )}
        {presets && presets.length > 0 && (
          <ul aria-label="Saved review presets" className="m-0 list-none p-0">
            {presets.map((preset) => (
              <SavedPresetRow key={preset.id} preset={preset} />
            ))}
          </ul>
        )}
      </Card>
      {builtins && (
        <Disclosure variant="inline" headingLevel="none" title="Built-in presets">
          <Card as="div" padding="none">
            <ul className="m-0 list-none p-0">
              {builtins.map((preset) => (
                <li
                  key={preset.id}
                  className="border-border border-b last:border-b-0"
                  style={ROW_STYLE}
                >
                  <div className="text-fg-0" style={NAME_STYLE}>
                    {preset.name}
                  </div>
                  <div className="text-fg-2" style={META_STYLE}>
                    {preset.description}
                  </div>
                  <Instructions>{preset.instructions}</Instructions>
                </li>
              ))}
            </ul>
          </Card>
        </Disclosure>
      )}
    </div>
  );
};
