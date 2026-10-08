import { useEffect, useId, useRef } from "react";

import { Field, SectionHeader } from "@shared/ui";

import { GenerationSettings } from "./GenerationSettings";
import { ModelPicker } from "./ModelPicker";
import { ProviderPicker } from "./ProviderPicker";

import type { AIProvider, ModelCapabilities } from "@entities/ai-provider";
import type { ProviderDispatchSettings } from "../model/dispatchSettings";

export type DispatchFormProps = {
  providers: AIProvider[];
  selectedProviderId: string;
  onProviderChange: (providerId: string) => void;
  /** The selected provider's models. */
  models: string[];
  settings: ProviderDispatchSettings;
  capabilities: ModelCapabilities | undefined;
  onSettingsChange: (patch: Partial<ProviderDispatchSettings>) => void;
  isDisabled: boolean;
  /** Opened on request (Edit): the chosen provider takes the focus when the form appears. */
  isFocusedOnOpen?: boolean;
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

/** Provider, model and generation settings for the next run. */
export const DispatchForm = ({
  providers,
  selectedProviderId,
  onProviderChange,
  models,
  settings,
  capabilities,
  onSettingsChange,
  isDisabled,
  isFocusedOnOpen = false,
}: DispatchFormProps): React.ReactElement => {
  const providerHeadingId = useId();
  const settingsHeadingId = useId();
  const providerSectionRef = useRef<HTMLElement>(null);
  // Read once, on mount: later renders must not pull the focus back.
  const isFocusedOnMount = useRef(isFocusedOnOpen);

  useEffect(() => {
    if (!isFocusedOnMount.current) return;
    // The radio group's tab stop is the chosen provider.
    providerSectionRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <section ref={providerSectionRef} aria-labelledby={providerHeadingId} style={sectionStyle}>
        <SectionHeader id={providerHeadingId} title="Provider" />
        <ProviderPicker
          providers={providers}
          value={selectedProviderId}
          onValueChange={onProviderChange}
          isDisabled={isDisabled}
          aria-labelledby={providerHeadingId}
        />
      </section>

      {/* The provider's list or any typed id. */}
      <Field label="Model">
        <ModelPicker
          models={models}
          value={settings.model}
          onChange={(model) => {
            onSettingsChange({ model });
          }}
          isDisabled={isDisabled}
        />
      </Field>

      {/* As far as the model accepts them. */}
      <section aria-labelledby={settingsHeadingId} style={sectionStyle}>
        <SectionHeader id={settingsHeadingId} title="Generation settings" />
        <GenerationSettings
          settings={settings}
          capabilities={capabilities}
          onChange={onSettingsChange}
          isDisabled={isDisabled}
        />
      </section>
    </div>
  );
};
