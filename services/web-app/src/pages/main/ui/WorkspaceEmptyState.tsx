import { GitPullRequest, Plus, Server } from "lucide-react";
import { useHosts } from "@entities/host";
import { Button, EmptyState, ICON_SIZE, Kbd } from "@shared/ui";
import { NAVIGATOR_SHORTCUT } from "@widgets/mr-header";

const KEY_HINTS: readonly { keys: readonly string[]; description: string }[] = [
  { keys: ["↑", "↓"], description: "Move through a list" },
  { keys: ["↵"], description: "Open the focused item" },
  { keys: [NAVIGATOR_SHORTCUT], description: "Show or hide the navigator" },
];

const KeyHints = (): React.ReactElement => (
  <dl
    aria-label="Keyboard shortcuts"
    className="text-fg-2 m-0 grid grid-cols-[auto_auto] items-center gap-x-(--space-3) gap-y-(--space-2) text-(length:--fs-control)"
  >
    {KEY_HINTS.map((hint) => (
      <div key={hint.description} className="contents">
        <dt className="flex justify-end gap-(--space-1)">
          {hint.keys.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </dt>
        <dd className="m-0">{hint.description}</dd>
      </div>
    ))}
  </dl>
);

export type WorkspaceEmptyStateProps = {
  isNavCollapsed: boolean;
  onShowNav: () => void;
  onAddHost: () => void;
};

/** The workspace before a merge request is open: what to do first, and the keys for it. */
export const WorkspaceEmptyState = ({
  isNavCollapsed,
  onShowNav,
  onAddHost,
}: WorkspaceEmptyStateProps): React.ReactElement => {
  const { data: hosts } = useHosts();

  if (hosts?.length === 0) {
    return (
      <EmptyState
        isFill
        icon={<Server size={ICON_SIZE.state} />}
        title="Connect a Git host"
        description="Add a GitLab, GitHub, Gitea, Forgejo or Bitbucket host with an access token to browse its merge requests."
        actions={
          <Button
            variant="primary"
            icon={<Plus size={ICON_SIZE.inline} aria-hidden="true" />}
            onClick={onAddHost}
          >
            Add host
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-(--space-4)">
      <EmptyState
        icon={<GitPullRequest size={ICON_SIZE.state} />}
        title="No merge request open"
        description="Pick one from the list to start a review, or open the Inbox for the ones waiting on you."
        {...(isNavCollapsed
          ? {
              actions: (
                <Button size="sm" onClick={onShowNav}>
                  Show navigator
                </Button>
              ),
            }
          : {})}
      />
      <KeyHints />
    </div>
  );
};
