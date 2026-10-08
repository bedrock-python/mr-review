import { Aperture, Asterisk, Server } from "lucide-react";

import { ICON_SIZE, SelectCardGroup } from "@shared/ui";

import type { AIProvider } from "@entities/ai-provider";
import type { SelectCardOption } from "@shared/ui";

type ProviderType = AIProvider["type"];

const PROVIDER_CARD_MIN_WIDTH_PX = 200;

/**
 * A provider's identity hue: only ever an icon tint, never a fill, a CTA or a selection ring.
 * Tokens, so each theme keeps it at 3:1 against its surfaces.
 */
const PROVIDER_HUE: Record<ProviderType, string> = {
  claude: "var(--c-major)",
  openai: "var(--c-add)",
  openai_compat: "var(--c-suggest)",
};

const PROVIDER_ICON: Record<ProviderType, typeof Asterisk> = {
  claude: Asterisk,
  openai: Aperture,
  openai_compat: Server,
};

const PROVIDER_LABEL: Record<ProviderType, string> = {
  claude: "Anthropic",
  openai: "OpenAI",
  openai_compat: "OpenAI-compatible",
};

export const ProviderIcon = ({ type }: { type: ProviderType }): React.ReactElement => {
  const Icon = PROVIDER_ICON[type];
  return (
    <Icon
      size={ICON_SIZE.button}
      aria-hidden="true"
      style={{ color: PROVIDER_HUE[type], flexShrink: 0 }}
    />
  );
};

const modelCount = (count: number): string =>
  count === 0 ? "no models listed" : `${String(count)} model${count !== 1 ? "s" : ""}`;

export type ProviderPickerProps = {
  providers: AIProvider[];
  value: string;
  onValueChange: (providerId: string) => void;
  isDisabled: boolean;
  "aria-labelledby": string;
};

/** The configured AI providers as selectable cards: one tab stop, arrows move the choice. */
export const ProviderPicker = ({
  providers,
  value,
  onValueChange,
  isDisabled,
  "aria-labelledby": labelledBy,
}: ProviderPickerProps): React.ReactElement => {
  const options: SelectCardOption<string>[] = providers.map((provider) => ({
    value: provider.id,
    title: provider.name,
    description: `${PROVIDER_LABEL[provider.type]} · ${modelCount(provider.models.length)}`,
    icon: <ProviderIcon type={provider.type} />,
    isDisabled,
  }));
  return (
    <SelectCardGroup
      options={options}
      value={value}
      onValueChange={onValueChange}
      aria-labelledby={labelledBy}
      minCardWidth={PROVIDER_CARD_MIN_WIDTH_PX}
    />
  );
};
