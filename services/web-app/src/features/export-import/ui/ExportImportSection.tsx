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

export const ExportImportSection = (): React.ReactElement => {
  const [includeHosts, setIncludeHosts] = useState(true);
  const [includeAIProviders, setIncludeAIProviders] = useState(true);
  const [includeReviews, setIncludeReviews] = useState(true);
  const [mergeStrategy, setMergeStrategy] = useState<"skip" | "replace" | "merge">("skip");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportMutation = useExportData();
  const importMutation = useImportData();

  const handleExport = (): void => {
    exportMutation.mutate(
      {
        include_hosts: includeHosts,
        include_ai_providers: includeAIProviders,
        include_reviews: includeReviews,
      },
      {
        onSuccess: () => {
          toast.success("Data exported successfully");
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

        importMutation.mutate(
          {
            ...data,
            merge_strategy: mergeStrategy,
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
            },
            onError: (error) => {
              toast.error(
                `Import failed: ${error instanceof Error ? error.message : "Unknown error"}`
              );
            },
          }
        );
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
          {isImporting ? "Importing..." : "Import Data"}
        </button>
      </div>
    </div>
  );
};
