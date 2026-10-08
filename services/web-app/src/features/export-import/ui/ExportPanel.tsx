import { useState } from "react";
import { toast } from "sonner";

import { useExportData } from "../model/useExportData";
import {
  buttonRowStyle,
  choiceStyle,
  headingStyle,
  hintStyle,
  inputStyle,
  labelStyle,
  panelStyle,
  warningStyle,
} from "./styles";
import type { ExportRequest } from "@shared/api/export-import.api";

type SecretsChoice = "encrypted" | "omitted" | "plain";

const SECRETS_CHOICES: { value: SecretsChoice; label: string; hint: string }[] = [
  {
    value: "encrypted",
    label: "Encrypt with a passphrase",
    hint: "Tokens and API keys are encrypted. You need the passphrase to import the file.",
  },
  {
    value: "omitted",
    label: "Leave secrets out",
    hint: "Everything except tokens and API keys. Re-enter them after importing.",
  },
  {
    value: "plain",
    label: "Include secrets in plain text",
    hint: "Anyone who gets the file can use your tokens and API keys.",
  },
];

const DATA_CHOICES = [
  ["hosts", "Hosts"],
  ["ai_providers", "AI providers"],
  ["review_presets", "Review presets"],
  ["reviews", "Review history"],
] as const;

type DataChoice = (typeof DATA_CHOICES)[number][0];

export const ExportPanel = (): React.ReactElement => {
  const [included, setIncluded] = useState<Record<DataChoice, boolean>>({
    hosts: true,
    ai_providers: true,
    review_presets: true,
    reviews: true,
  });
  const [secrets, setSecrets] = useState<SecretsChoice>("encrypted");
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const exportMutation = useExportData();

  const carriesSecrets = included.hosts || included.ai_providers;
  const needsPassphrase = carriesSecrets && secrets === "encrypted";
  const passphraseMismatch = needsPassphrase && confirmation !== "" && confirmation !== passphrase;
  const isReady =
    Object.values(included).some(Boolean) &&
    (!needsPassphrase || (passphrase !== "" && confirmation === passphrase));

  const handleExport = (): void => {
    const request: ExportRequest = {
      include_hosts: included.hosts,
      include_ai_providers: included.ai_providers,
      include_review_presets: included.review_presets,
      include_reviews: included.reviews,
    };
    if (needsPassphrase) request.encryption_password = passphrase;
    if (carriesSecrets && secrets === "plain") request.include_plain_secrets = true;

    exportMutation.mutate(request, {
      onSuccess: () => {
        toast.success("Export downloaded");
        setPassphrase("");
        setConfirmation("");
      },
      onError: (error) => {
        toast.error(`Export failed: ${error.message}`);
      },
    });
  };

  return (
    <section style={{ ...panelStyle, borderBottom: "1px solid var(--border)" }}>
      <h3 style={headingStyle}>Export data</h3>

      <fieldset style={{ border: "none", padding: 0, margin: "0 0 12px" }}>
        <legend style={labelStyle}>Include</legend>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {DATA_CHOICES.map(([key, label]) => (
            <label key={key} style={{ ...choiceStyle, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={included[key]}
                onChange={(e) => {
                  setIncluded((prev) => ({ ...prev, [key]: e.target.checked }));
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {carriesSecrets && (
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 12px" }}>
          <legend style={labelStyle}>Tokens and API keys</legend>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SECRETS_CHOICES.map((choice) => (
              <label key={choice.value} style={choiceStyle}>
                <input
                  type="radio"
                  name="export-secrets"
                  checked={secrets === choice.value}
                  onChange={() => {
                    setSecrets(choice.value);
                  }}
                />
                <span>
                  {choice.label}
                  <span style={{ ...hintStyle, display: "block" }}>{choice.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {secrets === "plain" && (
            <p role="note" style={warningStyle}>
              The file will contain every host token and AI provider API key in plain text. Keep it
              somewhere only you can read, and delete it when you no longer need it.
            </p>
          )}
        </fieldset>
      )}

      {needsPassphrase && (
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <label style={labelStyle}>
            Passphrase
            <input
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
              }}
              style={{ ...inputStyle, marginTop: 6 }}
            />
          </label>
          <label style={labelStyle}>
            Repeat passphrase
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
              }}
              aria-invalid={passphraseMismatch}
              style={{ ...inputStyle, marginTop: 6 }}
            />
          </label>
          {passphraseMismatch && (
            <p role="alert" style={{ ...hintStyle, color: "var(--c-critical)" }}>
              The passphrases do not match.
            </p>
          )}
        </div>
      )}

      <div style={buttonRowStyle}>
        <button
          type="button"
          onClick={handleExport}
          disabled={!isReady || exportMutation.isPending}
          className="btn primary"
          style={{ fontSize: 12 }}
        >
          {exportMutation.isPending ? "Exporting…" : "Export data"}
        </button>
      </div>
    </section>
  );
};
