import { useEffect, useId, useRef, useState } from "react";
import { Plus, RefreshCw, X } from "lucide-react";

import { Badge, Button, Callout, ICON_SIZE, IconButton, Input, SearchField } from "@shared/ui";

type FetchState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "done"; available: string[] };

// Past this many fetched models a filter field helps pick the right ones.
const FILTER_THRESHOLD = 8;

// The offered list scrolls instead of pushing the form's Save button far down.
const OFFERED_LIST_MAX_HEIGHT_PX = 200;

/**
 * A control that leaves the page when it is used (Make default, ×, Add) hands the focus to its
 * neighbour: the button of the same kind on the next row, else the previous one.
 */
type FocusTarget = { list: "configured" | "offered"; model: string } | "new-model";

const focusKey = (list: "configured" | "offered", model: string): string => `${list}:${model}`;

/** The item after `index` in `items`, else the one before it. */
const neighbourOf = (items: string[], index: number): string | undefined =>
  items[index + 1] ?? items[index - 1];

export type ModelListEditorProps = {
  models: string[];
  onChange: (models: string[]) => void;
  /** Lists the endpoint's models with the connection settings currently in the form. */
  onFetchModels: () => Promise<string[]>;
  /** Why the endpoint cannot be asked yet, e.g. no API key entered; fetching is off while set. */
  fetchBlockedReason?: string | null;
};

const columnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const boxStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-control)",
  background: "var(--bg-1)",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  minHeight: "var(--control-md)",
  padding: "var(--space-1) var(--space-1) var(--space-1) var(--space-3)",
};

const modelNameStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "var(--fs-control)",
  color: "var(--fg-0)",
};

const metaStyle: React.CSSProperties = { fontSize: "var(--fs-meta)", color: "var(--fg-2)" };

const emptyStyle: React.CSSProperties = {
  ...metaStyle,
  padding: "var(--space-2) var(--space-3)",
  textAlign: "center",
};

const inlineRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
};

/**
 * The provider's model list. The first model is the default for a dispatch that names none, and
 * the user picks it explicitly. Fetching from the API offers the endpoint's models to add — it
 * never replaces the list, so a curated list survives a fetch of hundreds of models.
 */
export const ModelListEditor = ({
  models,
  onChange,
  onFetchModels,
  fetchBlockedReason = null,
}: ModelListEditorProps): React.ReactElement => {
  const [newModel, setNewModel] = useState("");
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  const [filter, setFilter] = useState("");
  const newModelRef = useRef<HTMLInputElement>(null);
  const blockedReasonId = useId();
  const controls = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<FocusTarget | null>(null);

  const controlRef =
    (list: "configured" | "offered", model: string) =>
    (node: HTMLButtonElement | null): void => {
      if (node) controls.current.set(focusKey(list, model), node);
      else controls.current.delete(focusKey(list, model));
    };

  // The list changes through the form, so the new rows exist only on the next render.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === "new-model") newModelRef.current?.focus();
    else controls.current.get(focusKey(target.list, target.model))?.focus();
  }, [models]);

  const addModels = (toAdd: string[]): void => {
    const merged = [...models];
    for (const model of toAdd.map((m) => m.trim())) {
      if (model && !merged.includes(model)) merged.push(model);
    }
    onChange(merged);
  };

  const handleAdd = (): void => {
    addModels([newModel]);
    setNewModel("");
    newModelRef.current?.focus();
  };

  const handleFetch = async (): Promise<void> => {
    setFetchState({ status: "loading" });
    try {
      setFetchState({ status: "done", available: await onFetchModels() });
    } catch (err) {
      setFetchState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to fetch models",
      });
    }
  };

  const fetched = fetchState.status === "done" ? fetchState.available : [];
  const notAdded = fetched.filter((m) => !models.includes(m));
  const shown = notAdded.filter((m) => m.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div style={columnStyle}>
      <ul aria-label="Configured models" className="divide-border divide-y" style={boxStyle}>
        {models.length === 0 && (
          <li style={emptyStyle}>
            No models yet — add one; the first is used when a dispatch names none
          </li>
        )}
        {models.map((m, index) => (
          <li key={m} style={rowStyle}>
            <span className="mono" style={modelNameStyle} title={m}>
              {m}
            </span>
            {index === 0 ? (
              <Badge tone="accent">Default</Badge>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Make default: ${m}`}
                onClick={() => {
                  // The row moves to the top and loses this button; its × keeps the focus.
                  pendingFocus.current = { list: "configured", model: m };
                  onChange([m, ...models.filter((x) => x !== m)]);
                }}
              >
                Make default
              </Button>
            )}
            <IconButton
              ref={controlRef("configured", m)}
              size="sm"
              variant="danger"
              label={`Remove ${m}`}
              tooltip="Remove"
              icon={<X size={ICON_SIZE.inline} aria-hidden="true" />}
              onClick={() => {
                const next = neighbourOf(models, index);
                pendingFocus.current = next ? { list: "configured", model: next } : "new-model";
                onChange(models.filter((x) => x !== m));
              }}
            />
          </li>
        ))}
      </ul>

      <div style={inlineRowStyle}>
        <Input
          ref={newModelRef}
          type="text"
          isMono
          value={newModel}
          aria-label="New model ID"
          placeholder="e.g. claude-opus-5-5, gpt-5"
          onChange={(e) => {
            setNewModel(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          style={{ flex: 1 }}
        />
        <Button
          icon={<Plus size={ICON_SIZE.inline} aria-hidden="true" />}
          onClick={handleAdd}
          disabled={!newModel.trim()}
        >
          Add
        </Button>
      </div>

      <div style={{ ...inlineRowStyle, flexWrap: "wrap" }}>
        <Button
          size="sm"
          icon={<RefreshCw size={ICON_SIZE.inline} aria-hidden="true" />}
          isLoading={fetchState.status === "loading"}
          disabled={fetchBlockedReason !== null}
          aria-describedby={fetchBlockedReason ? blockedReasonId : undefined}
          onClick={() => {
            void handleFetch();
          }}
        >
          Fetch models from API
        </Button>
        {fetchBlockedReason && (
          <span id={blockedReasonId} style={metaStyle}>
            {fetchBlockedReason}
          </span>
        )}
      </div>

      {fetchState.status === "error" && (
        <Callout tone="danger" size="sm">
          {fetchState.message}
        </Callout>
      )}

      {fetchState.status === "done" && (
        <div
          role="region"
          aria-label="Models offered by the API"
          style={{ ...boxStyle, ...columnStyle, padding: "var(--space-2)" }}
        >
          <div style={inlineRowStyle}>
            <span style={{ ...metaStyle, flex: 1 }}>
              {notAdded.length === 0
                ? `All ${String(fetched.length)} models the API offers are in the list`
                : `${String(notAdded.length)} more offered by the API`}
            </span>
            {shown.length > 0 && (
              <Button
                size="sm"
                icon={<Plus size={ICON_SIZE.inline} aria-hidden="true" />}
                onClick={() => {
                  // This button goes once nothing is left to add: stay with what was added.
                  const [first] = shown;
                  if (first !== undefined)
                    pendingFocus.current = { list: "configured", model: first };
                  addModels(shown);
                }}
              >
                Add {shown.length === notAdded.length ? "all" : "shown"} ({shown.length})
              </Button>
            )}
          </div>
          {notAdded.length > FILTER_THRESHOLD && (
            <SearchField
              value={filter}
              onValueChange={setFilter}
              placeholder="Filter…"
              ariaLabel="Filter offered models"
            />
          )}
          {shown.length > 0 && (
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                maxHeight: OFFERED_LIST_MAX_HEIGHT_PX,
                overflowY: "auto",
              }}
            >
              {shown.map((m, index) => (
                <li key={m} style={{ ...rowStyle, minHeight: "var(--control-sm)" }}>
                  <span className="mono" style={modelNameStyle} title={m}>
                    {m}
                  </span>
                  <Button
                    ref={controlRef("offered", m)}
                    variant="ghost"
                    size="sm"
                    icon={<Plus size={ICON_SIZE.inline} aria-hidden="true" />}
                    aria-label={`Add ${m}`}
                    onClick={() => {
                      const next = neighbourOf(shown, index);
                      pendingFocus.current = next
                        ? { list: "offered", model: next }
                        : { list: "configured", model: m };
                      addModels([m]);
                    }}
                  >
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
