/**
 * Export/Import Section Component
 */

import { useState, useRef } from "react";
import { toast } from "sonner";
import { useExportData } from "../model/useExportData";
import { useImportData } from "../model/useImportData";
import type { ImportRequest } from "@shared/api/export-import.api";

const checkboxStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 3,
  cursor: "pointer",
};

const selectStyle: React.CSSProperties = {
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 12,
  color: "var(--fg-0)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  color: "var(--fg-0)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

export const ExportImportSection = (): React.ReactElement => {
  const [includeHosts, setIncludeHosts] = useState(true);
  const [includeAIProviders, setIncludeAIProviders] = useState(true);
  const [includeReviews, setIncludeReviews] = useState(true);
  const [exportType, setExportType] = useState<"plain" | "encrypted">("plain");
  const [exportPassword, setExportPassword] = useState("");

  const [mergeStrategy, setMergeStrategy] = useState<"skip" | "replace" | "merge">("skip");
  const [importPassword, setImportPassword] = useState("");
  const [importFileData, setImportFileData] = useState<ImportRequest | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportMutation = useExportData();
  const importMutation = useImportData();

  const handleExport = (): void => {
    if (exportType === "encrypted" && exportPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    exportMutation.mutate(
      {
        include_hosts: includeHosts,
        include_ai_providers: includeAIProviders,
        include_reviews: includeReviews,
        encryption_password: exportType === "encrypted" ? exportPassword : null,
      },
      {
        onSuccess: () => {
          toast.success(
            exportType === "encrypted"
              ? "Data exported successfully (encrypted)"
              : "Data exported successfully"
          );
          setExportPassword("");
        },
        onError: (error) => {
          toast.error(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        },
      }
    );
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as ImportRequest;
        setImportFileData(data);

        // If data is encrypted, show password prompt
        if (data.encrypted) {
          toast.info("This export is encrypted. Please enter the password.");
          return;
        }

        // If not encrypted, import directly
        handleImport(data, null);
      } catch (error) {
        toast.error(
          `Failed to parse file: ${error instanceof Error ? error.message : "Invalid JSON"}`
        );
      }
    };
    reader.readAsText(file);

    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = (data: ImportRequest, password: string | null): void => {
    importMutation.mutate(
      {
        ...data,
        merge_strategy: mergeStrategy,
        decryption_password: password,
      },
      {
        onSuccess: (result) => {
          const summary = [
            `Hosts: ${String(result.hosts_imported)} imported, ${String(result.hosts_skipped)} skipped`,
            `AI Providers: ${String(result.ai_providers_imported)} imported, ${String(result.ai_providers_skipped)} skipped`,
            `Reviews: ${String(result.reviews_imported)} imported, ${String(result.reviews_skipped)} skipped`,
          ];

          if (result.errors.length > 0) {
            toast.warning(
              `Import completed with errors:\n${result.errors.join("\n")}\n\n${summary.join("\n")}`
            );
          } else {
            toast.success(`Import completed successfully:\n${summary.join("\n")}`);
          }
          setImportPassword("");
          setImportFileData(null);
        },
        onError: (error) => {
          toast.error(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        },
      }
    );
  };

  const handleImportWithPassword = (): void => {
    if (!importFileData) return;
    if (importPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    handleImport(importFileData, importPassword);
  };

  const isExporting = exportMutation.isPending;
  const isImporting = importMutation.isPending;

  return (
    <div>
      {/* Export Section */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-0)", marginBottom: 10 }}>
            Export Data
          </h3>

          {/* Export Type Selection */}
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--fg-2)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Export Type
            </label>
            <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={exportType === "plain"}
                  onChange={() => {
                    setExportType("plain");
                    setExportPassword("");
                  }}
                  style={{ cursor: "pointer" }}
                />
                <span style={{ color: "var(--fg-1)" }}>Plain (tokens visible)</span>
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={exportType === "encrypted"}
                  onChange={() => {
                    setExportType("encrypted");
                  }}
                  style={{ cursor: "pointer" }}
                />
                <span style={{ color: "var(--fg-1)" }}>Encrypted (password protected)</span>
              </label>
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--fg-3)" }}>
              {exportType === "plain"
                ? "Tokens will be exported in plain text. Use only for local backups."
                : "Tokens will be encrypted with a password. You'll need the password to import."}
            </p>

            {exportType === "encrypted" && (
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--fg-2)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  Encryption Password
                </label>
                <input
                  type="password"
                  value={exportPassword}
                  onChange={(e) => {
                    setExportPassword(e.target.value);
                  }}
                  placeholder="Min 8 characters"
                  style={inputStyle}
                />
              </div>
            )}
          </div>

          {/* Data Selection */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={includeHosts}
                onChange={(e) => {
                  setIncludeHosts(e.target.checked);
                }}
                style={checkboxStyle}
              />
              <span style={{ color: "var(--fg-1)" }}>Hosts</span>
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={includeAIProviders}
                onChange={(e) => {
                  setIncludeAIProviders(e.target.checked);
                }}
                style={checkboxStyle}
              />
              <span style={{ color: "var(--fg-1)" }}>AI Providers</span>
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={includeReviews}
                onChange={(e) => {
                  setIncludeReviews(e.target.checked);
                }}
                style={checkboxStyle}
              />
              <span style={{ color: "var(--fg-1)" }}>Review History</span>
            </label>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || (!includeHosts && !includeAIProviders && !includeReviews)}
            className="btn primary"
            style={{ fontSize: 12 }}
          >
            {isExporting ? "Exporting..." : "Export Data"}
          </button>
        </div>
      </div>

      {/* Import Section */}
      <div style={{ padding: "14px 16px" }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-0)", marginBottom: 10 }}>
          Import Data
        </h3>

        {/* Show password input if encrypted file was selected */}
        {importFileData?.encrypted && (
          <div
            style={{
              marginBottom: 12,
              padding: "10px",
              background: "var(--bg-2)",
              borderRadius: 6,
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--fg-2)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Decryption Password
            </label>
            <input
              type="password"
              value={importPassword}
              onChange={(e) => {
                setImportPassword(e.target.value);
              }}
              placeholder="Enter password"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={handleImportWithPassword}
              disabled={isImporting}
              className="btn primary"
              style={{ fontSize: 12, marginTop: 8 }}
            >
              {isImporting ? "Importing..." : "Decrypt and Import"}
            </button>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--fg-2)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Merge Strategy
          </label>
          <select
            value={mergeStrategy}
            onChange={(e) => {
              setMergeStrategy(e.target.value as "skip" | "replace" | "merge");
            }}
            style={selectStyle}
          >
            <option value="skip">Skip existing items</option>
            <option value="replace">Replace existing items</option>
            <option value="merge">Merge with existing items</option>
          </select>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--fg-3)" }}>
            {mergeStrategy === "skip" &&
              "Existing items will be kept, only new items will be added"}
            {mergeStrategy === "replace" &&
              "Existing items will be deleted and replaced with imported data"}
            {mergeStrategy === "merge" && "Existing items will be updated, new items will be added"}
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          className="btn primary"
          style={{ fontSize: 12 }}
        >
          {isImporting ? "Importing..." : "Select File to Import"}
        </button>
      </div>
    </div>
  );
};
