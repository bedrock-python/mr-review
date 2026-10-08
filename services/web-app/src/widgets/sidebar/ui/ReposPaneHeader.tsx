import { Plus } from "lucide-react";
import { ICON_SIZE, IconButton, SearchField, Toolbar } from "@shared/ui";
import type { Host } from "@entities/host";

export type ReposPaneHeaderProps = {
  host: Host | undefined;
  search: string;
  onSearchChange: (value: string) => void;
  isSearchBusy: boolean;
  canAddRepo: boolean;
  onAddRepo: () => void;
};

/**
 * The host and the repository search, in two rows as tall as the merge request list's
 * toolbar next to it, so the two panes share one header line.
 */
export const ReposPaneHeader = ({
  host,
  search,
  onSearchChange,
  isSearchBusy,
  canAddRepo,
  onAddRepo,
}: ReposPaneHeaderProps): React.ReactElement => (
  <>
    <Toolbar size="sm" hasBorder={false} className="gap-(--space-2) px-(--space-3) pt-(--space-1)">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-fg-0 truncate text-(length:--fs-body) leading-(--lh-tight) font-semibold">
          {host?.name ?? "No host selected"}
        </span>
        {host && (
          <span className="text-fg-2 truncate font-mono text-(length:--fs-meta) leading-(--lh-tight)">
            {host.base_url}
          </span>
        )}
      </div>
      <IconButton
        size="sm"
        label="Add repository by URL"
        disabled={!canAddRepo}
        onClick={onAddRepo}
        icon={<Plus size={ICON_SIZE.inline} aria-hidden="true" />}
      />
    </Toolbar>
    <Toolbar size="sm" className="px-(--space-3) pb-(--space-1)">
      <SearchField
        value={search}
        onValueChange={onSearchChange}
        placeholder="Search repos…"
        ariaLabel="Search repositories"
        isBusy={isSearchBusy}
        isDisabled={!canAddRepo}
      />
    </Toolbar>
  </>
);
