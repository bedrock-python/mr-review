import { useTheme } from "next-themes";

import { SelectCardGroup } from "@shared/ui";
import type { SelectCardOption } from "@shared/ui";

import { SettingsSection } from "./SettingsSection";
import { ThemePreview } from "./ThemePreview";

import type { ThemeName } from "./ThemePreview";

const TITLE_ID = "settings-appearance";

// Three cards side by side in the settings column.
const THEME_CARD_MIN_WIDTH_PX = 160;

const THEME_OPTIONS: readonly SelectCardOption<ThemeName>[] = [
  {
    value: "ink",
    title: "Ink",
    description: "Dark — easy on the eyes",
    preview: <ThemePreview theme="ink" />,
  },
  {
    value: "paper",
    title: "Paper",
    description: "Light — clean and bright",
    preview: <ThemePreview theme="paper" />,
  },
  {
    value: "phosphor",
    title: "Phosphor",
    description: "Terminal — retro green",
    preview: <ThemePreview theme="phosphor" />,
  },
];

const isThemeName = (value: string): value is ThemeName =>
  THEME_OPTIONS.some((option) => option.value === value);

export const AppearanceSection = (): React.ReactElement => {
  const { theme, setTheme } = useTheme();
  // Before next-themes has read the stored choice, the page is in the default theme: ink.
  const current = theme ?? "ink";

  return (
    <SettingsSection
      titleId={TITLE_ID}
      title="Appearance"
      description="Choose a colour theme for the interface."
    >
      <SelectCardGroup
        aria-labelledby={TITLE_ID}
        options={THEME_OPTIONS}
        value={isThemeName(current) ? current : undefined}
        onValueChange={setTheme}
        minCardWidth={THEME_CARD_MIN_WIDTH_PX}
      />
    </SettingsSection>
  );
};
