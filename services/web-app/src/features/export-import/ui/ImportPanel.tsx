import { useRef, useState } from "react";
import { toast } from "sonner";

import { formatImportError } from "../lib/formatImportError";
import { summarizeImportResult } from "../lib/importSummary";
import { readExportFile } from "../lib/readExportFile";
import { useImportData, useImportPreview } from "../model/useImportData";
import { ImportConfirmDialog } from "./ImportConfirmDialog";
import { ImportPreviewCard } from "./ImportPreviewCard";
import { ImportStrategyPicker } from "./ImportStrategyPicker";
import {
  buttonRowStyle,
  errorStyle,
  headingStyle,
  inputStyle,
  labelStyle,
  panelStyle,
} from "./styles";
import type {
  ExportFile,
  ImportPreview,
  ImportRequest,
  MergeStrategy,
} from "@shared/api/export-import.api";

type LoadedFile = { name: string; file: ExportFile; preview: ImportPreview };

/**
 * Pick a file → see what it holds → choose how to merge → confirm → import.
 *
 * Nothing is written before the confirmation, and a failed attempt keeps the file loaded
 * with a single error message, so the passphrase or the strategy can be fixed and retried.
 */
export const ImportPanel = (): React.ReactElement => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [strategy, setStrategy] = useState<MergeStrategy>("skip");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const previewMutation = useImportPreview();
  const importMutation = useImportData();

  const isBusy = previewMutation.isPending || importMutation.isPending;
  const needsPassphrase = loaded?.preview.encrypted === true;
  const chooseLabel = loaded ? "Choose another file" : "Choose file…";

  const reset = (): void => {
    setLoaded(null);
    setPassphrase("");
    setStrategy("skip");
    setError(null);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const chosen = event.target.files?.[0];
    // Clear the input so choosing the same file again fires another change event.
    event.target.value = "";
    if (!chosen) return;
    reset();
    const read = await readExportFile(chosen);
    if (!read.ok) {
      setError(read.error);
      return;
    }
    previewMutation.mutate(read.file, {
      onSuccess: (preview) => {
        setLoaded({ name: chosen.name, file: read.file, preview });
      },
      onError: (previewError) => {
        setError(formatImportError(previewError));
      },
    });
  };

  const handleConfirm = (): void => {
    if (!loaded) return;
    const request: ImportRequest = { file: loaded.file, merge_strategy: strategy };
    if (needsPassphrase) request.decryption_password = passphrase;
    importMutation.mutate(request, {
      onSuccess: (result) => {
        setIsConfirming(false);
        reset();
        const details = [...summarizeImportResult(result), ...result.warnings, ...result.errors];
        const notify = result.errors.length > 0 ? toast.warning : toast.success;
        notify(result.errors.length > 0 ? "Import finished with errors" : "Import finished", {
          description: details.join("\n"),
        });
      },
      onError: (importError) => {
        setIsConfirming(false);
        setError(formatImportError(importError));
      },
    });
  };

  return (
    <section style={panelStyle}>
      <h3 style={headingStyle}>Import data</h3>

      {loaded && <ImportPreviewCard fileName={loaded.name} preview={loaded.preview} />}

      {loaded && (
        <ImportStrategyPicker value={strategy} isDisabled={isBusy} onChange={setStrategy} />
      )}

      {needsPassphrase && (
        <label style={{ ...labelStyle, marginBottom: 12 }}>
          Passphrase of this file
          <input
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
            }}
            style={{ ...inputStyle, marginTop: 6 }}
          />
        </label>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        aria-label="Export file to import"
        onChange={(event) => void handleFileChange(event)}
        style={{ display: "none" }}
      />
      <div style={buttonRowStyle}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy}
          className={loaded ? "btn ghost" : "btn primary"}
          style={{ fontSize: 12 }}
        >
          {previewMutation.isPending ? "Reading file…" : chooseLabel}
        </button>
        {loaded && (
          <>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setIsConfirming(true);
              }}
              disabled={isBusy || (needsPassphrase && passphrase === "")}
              className="btn primary"
              style={{ fontSize: 12 }}
            >
              Import…
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={isBusy}
              className="btn ghost"
              style={{ fontSize: 12 }}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {error && (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      )}

      {loaded && isConfirming && (
        <ImportConfirmDialog
          isPending={importMutation.isPending}
          fileName={loaded.name}
          preview={loaded.preview}
          strategy={strategy}
          onConfirm={handleConfirm}
          onCancel={() => {
            setIsConfirming(false);
          }}
        />
      )}
    </section>
  );
};
