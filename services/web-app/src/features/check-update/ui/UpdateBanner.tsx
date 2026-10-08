import { useState } from "react";
import { CircleArrowUp, X } from "lucide-react";
import { Button, ICON_SIZE, IconButton } from "@shared/ui";
import { COMPONENT_LABEL, useCheckUpdate, useDismissUpdate } from "../model";
import { ChangelogModal } from "./ChangelogModal";
import type { ComponentUpdateInfo, UpdateInfo } from "../api";
import type { VersionedComponent } from "../model";

type SingleBannerProps = {
  component: VersionedComponent;
  info: ComponentUpdateInfo;
  deploymentMode: UpdateInfo["deploymentMode"];
  onDismiss: () => void;
};

const SingleBanner = ({
  component,
  info,
  deploymentMode,
  onDismiss,
}: SingleBannerProps): React.ReactElement => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const label = COMPONENT_LABEL[component];

  return (
    <div
      role="status"
      className="border-border bg-bg-2 text-fg-1 flex min-h-(--control-lg) shrink-0 items-center gap-(--space-2) border-b pr-(--space-2) pl-(--space-4) text-(length:--fs-control)"
    >
      <CircleArrowUp size={ICON_SIZE.inline} aria-hidden="true" className="text-accent-fg" />
      <span className="min-w-0 flex-1 truncate">
        <strong className="text-fg-0 font-semibold">
          {label} v{info.latest}
        </strong>{" "}
        is available — you&apos;re on v{info.current}
      </span>
      <Button
        size="sm"
        onClick={() => {
          setIsModalOpen(true);
        }}
      >
        What&apos;s new
      </Button>
      <IconButton
        size="sm"
        label="Dismiss update notification"
        tooltip="Dismiss"
        tooltipSide="bottom"
        onClick={onDismiss}
        icon={<X size={ICON_SIZE.inline} aria-hidden="true" />}
      />
      <ChangelogModal
        componentLabel={label}
        component={info}
        deploymentMode={deploymentMode}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
        }}
      />
    </div>
  );
};

/** One line per part of mr-review with a newer release, until the user dismisses it. */
export const UpdateBanner = (): React.ReactElement | null => {
  const { data: updateInfo } = useCheckUpdate();
  const { isDismissed, dismiss } = useDismissUpdate();

  if (!updateInfo?.isAnyUpdateAvailable) return null;

  const backend = updateInfo.backend;
  const frontend = updateInfo.frontend;
  const showBackend = backend.isUpdateAvailable && !isDismissed(backend.release.tag_name);
  const showFrontend =
    frontend !== null && frontend.isUpdateAvailable && !isDismissed(frontend.release.tag_name);

  if (!showBackend && !showFrontend) return null;

  return (
    <>
      {showBackend && (
        <SingleBanner
          component="backend"
          info={backend}
          deploymentMode={updateInfo.deploymentMode}
          onDismiss={() => {
            dismiss(backend.release.tag_name);
          }}
        />
      )}
      {showFrontend && (
        <SingleBanner
          component="frontend"
          info={frontend}
          deploymentMode={updateInfo.deploymentMode}
          onDismiss={() => {
            dismiss(frontend.release.tag_name);
          }}
        />
      )}
    </>
  );
};
