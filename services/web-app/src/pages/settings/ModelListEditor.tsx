import { useRef, useState } from "react";

type FetchState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "done"; available: string[] };

// Past this many fetched models a filter field helps pick the right ones.
const FILTER_THRESHOLD = 8;

export type ModelListEditorProps = {
  models: string[];
  onChange: (models: string[]) => void;
  /** Lists the endpoint's models with the connection settings currently in the form. */
  onFetchModels: () => Promise<string[]>;
  /** Why the endpoint cannot be asked yet, e.g. no API key entered; fetching is off while set. */
  fetchBlockedReason?: string | null;
  inputStyle: React.CSSProperties;
};

const smallButtonCss: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "1px 6px",
  fontSize: 10,
  color: "var(--fg-3)",
  cursor: "pointer",
  flexShrink: 0,
};

const rowCss: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-0)",
};

const modelNameCss: React.CSSProperties = {
  flex: 1,
  fontSize: 12,
  color: "var(--fg-1)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
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
  inputStyle,
}: ModelListEditorProps): React.ReactElement => {
  const [newModel, setNewModel] = useState("");
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  const [filter, setFilter] = useState("");
  const newModelRef = useRef<HTMLInputElement>(null);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ul
        aria-label="Configured models"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {models.length === 0 && (
          <li
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px dashed var(--border)",
              fontSize: 11,
              color: "var(--fg-3)",
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            No models yet — add one; the first is used when a dispatch names none
          </li>
        )}
        {models.map((m, index) => (
          <li key={m} style={rowCss}>
            <span className="mono" style={modelNameCss} title={m}>
              {m}
            </span>
            {index === 0 ? (
              <span className="chip" style={{ fontSize: 10 }}>
                default
              </span>
            ) : (
              <button
                type="button"
                style={smallButtonCss}
                onClick={() => {
                  onChange([m, ...models.filter((x) => x !== m)]);
                }}
                aria-label={`Make ${m} the default`}
              >
                Make default
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onChange(models.filter((x) => x !== m));
              }}
              aria-label={`Remove ${m}`}
              style={{ ...smallButtonCss, border: "none", fontSize: 14, padding: "0 2px" }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div style={{ display: "flex", gap: 6 }}>
        <input
          ref={newModelRef}
          type="text"
          value={newModel}
          aria-label="New model ID"
          onChange={(e) => {
            setNewModel(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Model ID (e.g. claude-opus-5-5, gpt-5)"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="button"
          className="btn ghost"
          style={{ padding: "5px 10px", fontSize: 11, flexShrink: 0 }}
          onClick={handleAdd}
          disabled={!newModel.trim()}
        >
          Add
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn ghost"
          style={{ padding: "5px 12px", fontSize: 11 }}
          onClick={() => {
            void handleFetch();
          }}
          disabled={fetchState.status === "loading" || fetchBlockedReason !== null}
        >
          {fetchState.status === "loading" ? "Fetching…" : "Fetch models from API"}
        </button>
        {fetchBlockedReason && (
          <span style={{ fontSize: 11, color: "var(--fg-3)" }}>{fetchBlockedReason}</span>
        )}
        {fetchState.status === "error" && (
          <span role="alert" style={{ fontSize: 11, color: "var(--c-critical)" }}>
            {fetchState.message}
          </span>
        )}
      </div>

      {fetchState.status === "done" && (
        <div
          role="region"
          aria-label="Models offered by the API"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, fontSize: 11, color: "var(--fg-2)" }}>
              {notAdded.length === 0
                ? `All ${String(fetched.length)} models the API offers are in the list`
                : `${String(notAdded.length)} more offered by the API`}
            </span>
            {shown.length > 0 && (
              <button
                type="button"
                style={smallButtonCss}
                onClick={() => {
                  addModels(shown);
                }}
              >
                Add {shown.length === notAdded.length ? "all" : "shown"} ({shown.length})
              </button>
            )}
          </div>
          {notAdded.length > FILTER_THRESHOLD && (
            <input
              type="search"
              value={filter}
              aria-label="Filter offered models"
              placeholder="Filter…"
              onChange={(e) => {
                setFilter(e.target.value);
              }}
              style={inputStyle}
            />
          )}
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              maxHeight: 200,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {shown.map((m) => (
              <li key={m} style={{ ...rowCss, border: "none", padding: "3px 6px" }}>
                <span className="mono" style={modelNameCss} title={m}>
                  {m}
                </span>
                <button
                  type="button"
                  style={smallButtonCss}
                  onClick={() => {
                    addModels([m]);
                  }}
                  aria-label={`Add ${m}`}
                >
                  + Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
