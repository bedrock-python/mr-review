import { useRef, useState } from "react";
import { useVersions, VersionsDialog } from "@features/check-update";
import { Tooltip } from "@shared/ui";

/**
 * Both versions at the foot of the repositories pane, "web 0.2.2 · api 0.2.1", with a dot
 * when either has a newer release; it opens the versions dialog.
 */
export const VersionBadge = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const versions = useVersions();
  const web = versions.frontend.current ?? "unknown";
  const api = versions.backend.current;
  const visibleText = api === null ? `web ${web}` : `web ${web} · api ${api}`;
  // Starts with what the button shows, so speech input can name it by what is on screen.
  const name = `${visibleText} — versions${versions.isAnyUpdateAvailable ? ", update available" : ""}`;

  return (
    <>
      <Tooltip content={versions.isAnyUpdateAvailable ? "Update available" : "Versions"}>
        <button
          ref={buttonRef}
          type="button"
          aria-label={name}
          onClick={() => {
            setIsOpen(true);
          }}
          className="text-fg-2 hover:bg-bg-hover hover:text-fg-1 flex h-(--control-sm) shrink-0 items-center gap-(--space-1) rounded-(--radius-1) px-(--space-1) font-mono text-(length:--fs-meta) transition-colors duration-(--dur-fast)"
        >
          <span>web {web}</span>
          {api !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span>api {api}</span>
            </>
          )}
          {versions.isAnyUpdateAvailable && (
            <span
              aria-hidden="true"
              className="bg-accent size-(--dot-size) shrink-0 rounded-full"
            />
          )}
        </button>
      </Tooltip>
      <VersionsDialog
        versions={versions}
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
        }}
        returnFocusRef={buttonRef}
      />
    </>
  );
};
