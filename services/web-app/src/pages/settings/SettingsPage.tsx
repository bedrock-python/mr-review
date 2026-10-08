import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { ExportPanel, ImportPanel } from "@features/export-import";
import { ReviewPresetsManager } from "@features/manage-review-presets";
import { ICON_SIZE, IconButton, Toolbar, ToolbarDivider } from "@shared/ui";

import { AppearanceSection } from "./ui/AppearanceSection";
import { HostsSection } from "./ui/hosts/HostsSection";
import { ProvidersSection } from "./ui/providers/ProvidersSection";
import { SettingsSection } from "./ui/SettingsSection";
import { StorageSection } from "./ui/StorageSection";

// Wide enough for a 220px label column beside forms with two fields per row.
const CONTENT_MAX_WIDTH_PX = 880;

const pageStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  overflow: "hidden",
  background: "var(--bg-0)",
  color: "var(--fg-0)",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--fs-body)",
  fontWeight: "var(--fw-semibold)",
  color: "var(--fg-0)",
};

const scrollStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: "0 var(--space-6) var(--space-8)",
};

export const SettingsPage = (): React.ReactElement => {
  const navigate = useNavigate();

  return (
    <div style={pageStyle}>
      <Toolbar>
        <IconButton
          label="Back"
          tooltip="Back to reviews"
          icon={<ArrowLeft size={ICON_SIZE.button} aria-hidden="true" />}
          onClick={() => {
            void navigate("/");
          }}
        />
        <ToolbarDivider />
        <h1 style={titleStyle}>Settings</h1>
      </Toolbar>

      <main style={scrollStyle}>
        <div
          className="divide-border divide-y"
          style={{ maxWidth: CONTENT_MAX_WIDTH_PX, margin: "0 auto" }}
        >
          <HostsSection />
          <ProvidersSection />
          <SettingsSection
            titleId="settings-presets"
            title="Review presets"
            description="Review intents saved from the Brief, with the instructions they put in the prompt."
          >
            <ReviewPresetsManager />
          </SettingsSection>
          <AppearanceSection />
          <SettingsSection
            titleId="settings-export"
            title="Export"
            description="Download your hosts, providers, presets and review history as one file."
          >
            <ExportPanel />
          </SettingsSection>
          <SettingsSection
            titleId="settings-import"
            title="Import"
            description="Load an export file. You see what it holds and choose how to merge it before anything is written."
          >
            <ImportPanel />
          </SettingsSection>
          <StorageSection />
        </div>
      </main>
    </div>
  );
};
