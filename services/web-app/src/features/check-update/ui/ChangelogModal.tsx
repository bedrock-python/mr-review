import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { copyText } from "@shared/lib";
import { Button, Dialog, ICON_SIZE, IconButton, Markdown, buttonClassName } from "@shared/ui";
import type { ComponentUpdateInfo, UpdateInfo } from "../api";

type ChangelogModalProps = {
  /** "API" or "Web app": the part of mr-review this release is for. */
  componentLabel: string;
  component: ComponentUpdateInfo;
  deploymentMode: UpdateInfo["deploymentMode"];
  isOpen: boolean;
  onClose: () => void;
};

const UPDATE_COMMAND = "docker compose pull && docker compose up -d";
const COPIED_FEEDBACK_MS = 2000;

/** The release notes of a newer version, and the command that installs it. */
export const ChangelogModal = ({
  componentLabel,
  component,
  deploymentMode,
  isOpen,
  onClose,
}: ChangelogModalProps): React.ReactElement => {
  const [isCopied, setIsCopied] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(resetTimer.current);
    },
    []
  );

  const handleCopy = (): void => {
    copyText(UPDATE_COMMAND).then(
      () => {
        setIsCopied(true);
        window.clearTimeout(resetTimer.current);
        resetTimer.current = window.setTimeout(() => {
          setIsCopied(false);
        }, COPIED_FEEDBACK_MS);
      },
      (error: unknown) => {
        toast.error("Could not copy", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    );
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={`What's new in ${componentLabel} v${component.latest}`}
      description={`You're on v${component.current}.`}
      footer={
        <>
          <a
            href={component.release.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClassName({ variant: "ghost" })}
          >
            View on GitHub
            <ExternalLink size={ICON_SIZE.inline} aria-hidden="true" />
          </a>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="flex flex-col gap-(--space-4)">
        {component.release.body ? (
          <Markdown>{component.release.body}</Markdown>
        ) : (
          <p className="text-fg-2 m-0 text-(length:--fs-control)">No changelog provided.</p>
        )}
        <div className="flex flex-col gap-(--space-2)">
          <p className="ui-eyebrow m-0">Update ({deploymentMode})</p>
          <div className="border-border bg-bg-0 flex items-center gap-(--space-2) rounded-(--radius-2) border py-(--space-1) pr-(--space-1) pl-(--space-3)">
            <code className="text-fg-0 min-w-0 flex-1 font-mono text-(length:--fs-meta) select-all">
              {UPDATE_COMMAND}
            </code>
            <IconButton
              size="sm"
              label={isCopied ? "Copied" : "Copy the command"}
              onClick={handleCopy}
              icon={
                isCopied ? (
                  <Check size={ICON_SIZE.inline} aria-hidden="true" className="text-accent-fg" />
                ) : (
                  <Copy size={ICON_SIZE.inline} aria-hidden="true" />
                )
              }
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
