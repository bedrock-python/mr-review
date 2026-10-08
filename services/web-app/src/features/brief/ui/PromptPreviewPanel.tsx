import { memo, useState } from "react";
import type { PromptPreviewState } from "../model";
import { PromptBreakdown } from "./PromptBreakdown";
import { noticeStyle } from "./styles";

const CopyIcon = (): React.ReactElement => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

/**
 * The prompt as literal text. It is plain text, not Markdown — a diff full of ``` and # would not
 * survive a Markdown renderer — and memoised, so editing the brief does not re-render megabytes.
 */
const PromptText = memo(function PromptText({ text }: { text: string }): React.ReactElement {
  return (
    <pre
      aria-label="Prompt text"
      style={{
        margin: 0,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        lineHeight: 1.55,
        color: "var(--fg-1)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {text}
    </pre>
  );
});

export type CopyState =
  { status: "idle" } | { status: "copied" } | { status: "failed"; message: string };

export type PromptPreviewPanelProps = {
  state: PromptPreviewState;
  copy: CopyState;
  onCopy: () => void;
  footer: React.ReactNode;
};

const Spinner = (): React.ReactElement => (
  <div
    aria-hidden="true"
    className="animate-spin"
    style={{
      width: 10,
      height: 10,
      border: "1.5px solid var(--border)",
      borderTopColor: "var(--accent)",
      borderRadius: "50%",
    }}
  />
);

export const PromptPreviewPanel = ({
  state,
  copy,
  onCopy,
  footer,
}: PromptPreviewPanelProps): React.ReactElement => {
  const { preview, isRequested, isFetching, error, isStale, refresh } = state;
  const [showBreakdown, setShowBreakdown] = useState(true);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--bg-0)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 12, color: "var(--fg-2)", fontWeight: 500 }}>
            Prompt Preview
          </h2>
          {isFetching && <Spinner />}
          {isStale && !isFetching && (
            <span
              role="status"
              className="chip mono"
              style={{ fontSize: 10, color: "var(--c-major)" }}
            >
              Out of date
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {preview && (
            <span
              className="chip mono"
              style={{ fontSize: 10 }}
              title="Estimated at 4 characters per token"
            >
              ≈ {preview.estimated_tokens.toLocaleString()} tokens (est.)
            </span>
          )}
          <button
            type="button"
            className={isStale ? "btn primary" : "btn ghost"}
            style={{ padding: "4px 8px", gap: 5 }}
            onClick={refresh}
            disabled={isFetching}
          >
            {isRequested ? "Refresh" : "Preview"}
          </button>
          <button
            type="button"
            className="btn ghost"
            style={{ padding: "4px 8px", gap: 5 }}
            onClick={onCopy}
            disabled={!preview}
          >
            <CopyIcon />
            {copy.status === "copied" ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      {copy.status === "failed" && (
        <div role="alert" style={{ ...noticeStyle("var(--c-critical)"), margin: "8px 16px 0" }}>
          {copy.message}
        </div>
      )}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          opacity: isFetching ? 0.5 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {error && (
          <div role="alert" style={{ ...noticeStyle("var(--c-critical)"), marginBottom: 12 }}>
            {`Could not build the prompt: ${error.message}`}
          </div>
        )}
        {preview ? (
          <>
            <button
              type="button"
              className="btn ghost"
              aria-expanded={showBreakdown}
              style={{ padding: "2px 6px", fontSize: 11, marginBottom: 6 }}
              onClick={() => {
                setShowBreakdown((shown) => !shown);
              }}
            >
              {showBreakdown ? "Hide breakdown" : "Show breakdown"}
            </button>
            {showBreakdown && (
              <div style={{ marginBottom: 12 }}>
                <PromptBreakdown preview={preview} />
              </div>
            )}
            <div style={{ opacity: isStale ? 0.6 : 1 }}>
              <PromptText text={preview.prompt} />
            </div>
          </>
        ) : (
          !isFetching &&
          !error && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: 16,
                color: "var(--fg-3)",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              <span style={{ lineHeight: 1.5, maxWidth: 240 }}>
                Configure the brief on the left, then preview the prompt and what fits in it
              </span>
              <button type="button" className="btn primary" style={{ gap: 6 }} onClick={refresh}>
                Preview prompt
              </button>
            </div>
          )
        )}
      </div>
      {footer}
    </div>
  );
};
