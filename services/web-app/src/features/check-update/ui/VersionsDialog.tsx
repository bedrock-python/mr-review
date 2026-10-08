import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, ICON_SIZE, StatusBadge } from "@shared/ui";
import { COMPONENT_LABEL, updateKeys } from "../model";
import { ChangelogModal } from "./ChangelogModal";
import type { ComponentVersion, Versions } from "../model";

const UNKNOWN_VERSION = "unknown";

type VersionRowProps = {
  version: ComponentVersion;
  onShowChanges: () => void;
};

const VersionRow = ({ version, onShowChanges }: VersionRowProps): React.ReactElement => (
  <div className="border-border flex min-h-(--control-lg) items-center gap-(--space-3) border-b py-(--space-2) last:border-b-0">
    <dt className="ui-eyebrow m-0 w-1/4 shrink-0">{COMPONENT_LABEL[version.component]}</dt>
    <dd className="m-0 flex min-w-0 flex-1 items-center gap-(--space-2)">
      <span className="text-fg-0 font-mono text-(length:--fs-control)">
        {version.current === null ? UNKNOWN_VERSION : `v${version.current}`}
      </span>
      {version.update !== null && (
        <>
          <StatusBadge status="active" label={`v${version.update.latest} available`} />
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onShowChanges}>
            What&apos;s new
          </Button>
        </>
      )}
      {version.update === null && version.isChecked && (
        <StatusBadge status="success" label="Up to date" />
      )}
    </dd>
  </div>
);

export type VersionsDialogProps = {
  versions: Versions;
  isOpen: boolean;
  onClose: () => void;
};

/** Both versions, what is newer, and a way to look again. */
export const VersionsDialog = ({
  versions,
  isOpen,
  onClose,
}: VersionsDialogProps): React.ReactElement => {
  const queryClient = useQueryClient();
  const [changelogFor, setChangelogFor] = useState<ComponentVersion | null>(null);

  const handleCheck = (): void => {
    void queryClient.invalidateQueries({ queryKey: updateKeys.all });
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        size="md"
        title="Versions"
        description="mr-review ships as a web app and an API, released separately."
        footer={
          <Button
            icon={<RefreshCw size={ICON_SIZE.inline} aria-hidden="true" />}
            isLoading={versions.isChecking}
            onClick={handleCheck}
          >
            {versions.isChecking ? "Checking…" : "Check for updates"}
          </Button>
        }
      >
        <dl className="m-0">
          {[versions.frontend, versions.backend].map((version) => (
            <VersionRow
              key={version.component}
              version={version}
              onShowChanges={() => {
                // One dialog at a time: the release notes replace this one.
                onClose();
                setChangelogFor(version);
              }}
            />
          ))}
        </dl>
        {versions.hasCheckFailed && (
          <p className="text-fg-2 m-0 mt-(--space-2) text-(length:--fs-meta)">
            Could not reach GitHub to look for updates.
          </p>
        )}
      </Dialog>
      {changelogFor?.update && (
        <ChangelogModal
          componentLabel={COMPONENT_LABEL[changelogFor.component]}
          component={changelogFor.update}
          deploymentMode={versions.deploymentMode}
          isOpen
          onClose={() => {
            setChangelogFor(null);
          }}
        />
      )}
    </>
  );
};
