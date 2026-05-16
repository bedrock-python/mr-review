import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { Markdown } from "@shared/ui";
import type { ComponentUpdateInfo, UpdateInfo } from "../api";

type ChangelogModalProps = {
  component: ComponentUpdateInfo;
  deploymentMode: UpdateInfo["deploymentMode"];
  isOpen: boolean;
  onClose: () => void;
};

const UPDATE_COMMAND = "docker compose pull && docker compose up -d";

const CopyIcon = (): React.ReactElement => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const ChangelogModal = ({
  component,
  deploymentMode,
  isOpen,
  onClose,
}: ChangelogModalProps): React.ReactElement => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(UPDATE_COMMAND).then(() => {
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    });
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 200,
          }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 201,
            width: 580,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "80vh",
            background: "var(--bg-1)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "18px 20px 14px",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <Dialog.Title
                style={{ fontSize: 16, fontWeight: 700, color: "var(--fg-0)", margin: 0 }}
              >
                What&apos;s new in v{component.latest}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--fg-3)",
                    padding: 4,
                    borderRadius: 4,
                    lineHeight: 1,
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description style={{ fontSize: 12, color: "var(--fg-3)", margin: 0 }}>
              You are on v{component.current}
            </Dialog.Description>
          </div>

          {/* Changelog body */}
          <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
            {component.release.body ? (
              <Markdown>{component.release.body}</Markdown>
            ) : (
              <p style={{ fontSize: 12, color: "var(--fg-3)" }}>No changelog provided.</p>
            )}
          </div>

          {/* Update command footer */}
          <div
            style={{
              padding: "14px 20px",
              borderTop: "1px solid var(--border)",
              flexShrink: 0,
              background: "var(--bg-0)",
            }}
          >
            <p style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 8 }}>
              Run this command to update ({deploymentMode}):
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "8px 12px",
              }}
            >
              <code
                className="mono"
                style={{ flex: 1, fontSize: 11, color: "var(--fg-0)", userSelect: "all" }}
              >
                {UPDATE_COMMAND}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                title="Copy to clipboard"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: isCopied ? "var(--accent)" : "var(--fg-3)",
                  padding: 4,
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {isCopied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <a
                href={component.release.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn ghost"
                style={{ padding: "6px 14px", textDecoration: "none", fontSize: 12 }}
              >
                View on GitHub ↗
              </a>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ padding: "6px 14px", fontSize: 12 }}
                >
                  Dismiss
                </button>
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
