import { useState } from "react";
import { Bot } from "lucide-react";

import { useAIProviders, useDeleteAIProvider } from "@entities/ai-provider";
import type { AIProvider } from "@entities/ai-provider";
import { Badge, ICON_SIZE } from "@shared/ui";

import { PROVIDER_TYPE_LABELS, claudeBaseUrlWarning } from "../../lib/providerEndpoint";
import { SettingsList } from "../SettingsList";
import { RowActions, SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { fieldWithNoteStyle, rowMetaStyle, rowNameStyle } from "../styles";
import { AddProviderForm } from "./AddProviderForm";
import { BaseUrlWarning } from "./BaseUrlWarning";
import { EditProviderForm } from "./EditProviderForm";
import { ModelTags } from "./ModelTags";

const ProviderRow = ({ provider }: { provider: AIProvider }): React.ReactElement => {
  const deleteProvider = useDeleteAIProvider();
  const [isEditing, setIsEditing] = useState(false);
  const modelCount = provider.models.length;

  if (isEditing) {
    return (
      <li>
        <EditProviderForm
          provider={provider}
          onDone={() => {
            setIsEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li>
      <SettingsRow
        icon={<Bot size={ICON_SIZE.button} aria-hidden="true" style={{ color: "var(--fg-2)" }} />}
        head={
          <>
            <span style={rowNameStyle} title={provider.name}>
              {provider.name}
            </span>
            <Badge>{PROVIDER_TYPE_LABELS[provider.type]}</Badge>
            {modelCount > 0 && (
              <span style={rowMetaStyle}>
                {modelCount} model{modelCount === 1 ? "" : "s"}
              </span>
            )}
          </>
        }
        details={
          <div style={fieldWithNoteStyle}>
            <ModelTags models={provider.models} />
            <BaseUrlWarning message={claudeBaseUrlWarning(provider.type, provider.base_url)} />
          </div>
        }
        actions={
          <RowActions
            name={provider.name}
            kind="provider"
            consequence="Its API key and model list are deleted. Reviews generated with it stay in the history."
            isRemoving={deleteProvider.isPending}
            onEdit={() => {
              setIsEditing(true);
            }}
            onRemove={() => {
              deleteProvider.mutate(provider.id);
            }}
          />
        }
      />
    </li>
  );
};

export const ProvidersSection = (): React.ReactElement => {
  const { data: providers, isLoading } = useAIProviders();
  return (
    <SettingsSection
      titleId="settings-providers"
      title="AI providers"
      description="Configure language models used to generate code review comments."
    >
      <SettingsList
        label="AI providers"
        isLoading={isLoading}
        emptyTitle="No AI providers yet"
        emptyIcon={<Bot size={ICON_SIZE.inline} aria-hidden="true" />}
        footer={<AddProviderForm />}
      >
        {providers?.map((provider) => (
          <ProviderRow key={provider.id} provider={provider} />
        ))}
      </SettingsList>
    </SettingsSection>
  );
};
