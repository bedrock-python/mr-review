import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { Button, Callout, Card, Field, ICON_SIZE, Input } from "@shared/ui";

import { formatImportError } from "../lib/formatImportError";
import { summarizeImportResult } from "../lib/importSummary";
import { readExportFile } from "../lib/readExportFile";
import { useImportData, useImportPreview } from "../model/useImportData";
import { ImportConfirmDialog } from "./ImportConfirmDialog";
import { ImportPreviewCard } from "./ImportPreviewCard";
import { ImportStrategyPicker } from "./ImportStrategyPicker";
import { buttonRowStyle, panelStyle } from "./styles";
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

  const chooseButton = (
    <Button
      variant={loaded ? "secondary" : "primary"}
      icon={<Upload size={ICON_SIZE.inline} aria-hidden="true" />}
      isLoading={previewMutation.isPending}
      disabled={importMutation.isPending}
      onClick={() => fileInputRef.current?.click()}
    >
      {loaded ? "Choose another file" : "Choose file…"}
    </Button>
  );

  return (
    <Card style={panelStyle}>
      {loaded && <ImportPreviewCard fileName={loaded.name} preview={loaded.preview} />}

      {loaded && (
        <ImportStrategyPicker value={strategy} isDisabled={isBusy} onChange={setStrategy} />
      )}

      {needsPassphrase && (
        <Field label="Passphrase of this file">
          <Input
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
            }}
          />
        </Field>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        aria-label="Export file to import"
        onChange={(event) => void handleFileChange(event)}
        style={{ display: "none" }}
      />

      {error && <Callout tone="danger">{error}</Callout>}

      <div style={buttonRowStyle}>
        {loaded ? (
          <>
            <Button
              variant="primary"
              onClick={() => {
                setError(null);
                setIsConfirming(true);
              }}
              disabled={isBusy || (needsPassphrase && passphrase === "")}
            >
              Import…
            </Button>
            {chooseButton}
            <Button variant="ghost" onClick={reset} disabled={isBusy}>
              Cancel
            </Button>
          </>
        ) : (
          chooseButton
        )}
      </div>

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
    </Card>
  );
};
