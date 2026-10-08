import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import {
  Button,
  Callout,
  Card,
  Checkbox,
  Field,
  ICON_SIZE,
  Input,
  Radio,
  RadioGroup,
} from "@shared/ui";

import { useExportData } from "../model/useExportData";
import {
  buttonRowStyle,
  fieldsetStyle,
  inlineRowStyle,
  legendStyle,
  panelStyle,
  twoColumnsStyle,
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

const isSecretsChoice = (value: string): value is SecretsChoice =>
  SECRETS_CHOICES.some((choice) => choice.value === value);

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
    <Card style={panelStyle}>
      <fieldset style={fieldsetStyle}>
        <legend className="ui-eyebrow" style={legendStyle}>
          Include
        </legend>
        <div style={inlineRowStyle}>
          {DATA_CHOICES.map(([key, label]) => (
            <Checkbox
              key={key}
              label={label}
              checked={included[key]}
              onCheckedChange={(checked) => {
                setIncluded((prev) => ({ ...prev, [key]: checked }));
              }}
            />
          ))}
        </div>
      </fieldset>

      {carriesSecrets && (
        <RadioGroup
          legend="Tokens and API keys"
          name="export-secrets"
          value={secrets}
          onValueChange={(value) => {
            if (isSecretsChoice(value)) setSecrets(value);
          }}
        >
          {SECRETS_CHOICES.map((choice) => (
            <Radio
              key={choice.value}
              value={choice.value}
              label={choice.label}
              description={choice.hint}
            />
          ))}
        </RadioGroup>
      )}

      {carriesSecrets && secrets === "plain" && (
        <Callout tone="warn" size="sm">
          The file will contain every host token and AI provider API key in plain text. Keep it
          somewhere only you can read, and delete it when you no longer need it.
        </Callout>
      )}

      {needsPassphrase && (
        <div style={twoColumnsStyle}>
          <Field label="Passphrase">
            <Input
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
              }}
            />
          </Field>
          <Field
            label="Repeat passphrase"
            error={
              passphraseMismatch ? (
                <span role="alert">The passphrases do not match.</span>
              ) : undefined
            }
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
              }}
            />
          </Field>
        </div>
      )}

      <div style={buttonRowStyle}>
        <Button
          variant="primary"
          icon={<Download size={ICON_SIZE.inline} aria-hidden="true" />}
          onClick={handleExport}
          disabled={!isReady}
          isLoading={exportMutation.isPending}
        >
          Export data
        </Button>
      </div>
    </Card>
  );
};
