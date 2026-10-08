import { memo } from "react";
import { formatBranchRange, getRepoNameFromPath } from "@entities/mr";
import { MRItemButton, MRItemHeadline, MRItemMeta } from "./MRItemParts";
import type { InboxMR } from "@entities/mr";

export type InboxMRListItemProps = {
  mr: InboxMR;
  isSelected: boolean;
  onSelect: (mr: InboxMR) => void;
};

const InboxMRListItemComponent = ({
  mr,
  isSelected,
  onSelect,
}: InboxMRListItemProps): React.ReactElement => (
  <MRItemButton
    isSelected={isSelected}
    onClick={() => {
      onSelect(mr);
    }}
    title={formatBranchRange(mr.source_branch, mr.target_branch) ?? undefined}
  >
    <MRItemHeadline mr={mr} isSelected={isSelected} />
    <MRItemMeta mr={mr} repoName={getRepoNameFromPath(mr.repo_path)} repoPath={mr.repo_path} />
  </MRItemButton>
);

export const InboxMRListItem = memo(InboxMRListItemComponent);
