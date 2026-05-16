import { useState } from "react";

import { useCheckUpdate, useDismissUpdate } from "../model";
import type { ComponentUpdateInfo } from "../api";
import type { UpdateInfo } from "../api";
import { ChangelogModal } from "./ChangelogModal";

type SingleBannerProps = {
  label: string;
  component: ComponentUpdateInfo;
  deploymentMode: UpdateInfo["deploymentMode"];
  onDismiss: () => void;
};

const SingleBanner = ({
  label,
  component,
  deploymentMode,
  onDismiss,
}: SingleBannerProps): React.ReactElement => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "7px 16px",
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          color: "var(--fg-1)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--accent)",
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1 }}>
          <strong style={{ color: "var(--fg-0)" }}>
            {label} v{component.latest}
          </strong>{" "}
          is available — you&apos;re on v{component.current}
        </span>
        <button
          type="button"
          onClick={() => {
            setIsModalOpen(true);
          }}
          style={{
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            borderRadius: 5,
            cursor: "pointer",
            color: "var(--fg-0)",
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 10px",
          }}
        >
          What&apos;s new
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss update notification"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--fg-3)",
            fontSize: 14,
            lineHeight: 1,
            padding: "2px 4px",
          }}
        >
          ✕
        </button>
      </div>

      {isModalOpen && (
        <ChangelogModal
          component={component}
          deploymentMode={deploymentMode}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
          }}
        />
      )}
    </>
  );
};

export const UpdateBanner = (): React.ReactElement | null => {
  const { data: updateInfo } = useCheckUpdate();
  const { isDismissed, dismiss } = useDismissUpdate();

  if (!updateInfo?.isAnyUpdateAvailable) return null;

  const showBackend =
    updateInfo.backend.isUpdateAvailable && !isDismissed(updateInfo.backend.release.tag_name);

  const showFrontend =
    updateInfo.frontend !== null &&
    updateInfo.frontend.isUpdateAvailable &&
    !isDismissed(updateInfo.frontend.release.tag_name);

  if (!showBackend && !showFrontend) return null;

  const frontend = updateInfo.frontend;

  return (
    <>
      {showBackend && (
        <SingleBanner
          label="Backend"
          component={updateInfo.backend}
          deploymentMode={updateInfo.deploymentMode}
          onDismiss={() => {
            dismiss(updateInfo.backend.release.tag_name);
          }}
        />
      )}
      {showFrontend && frontend !== null && (
        <SingleBanner
          label="Frontend"
          component={frontend}
          deploymentMode={updateInfo.deploymentMode}
          onDismiss={() => {
            dismiss(frontend.release.tag_name);
          }}
        />
      )}
    </>
  );
};
