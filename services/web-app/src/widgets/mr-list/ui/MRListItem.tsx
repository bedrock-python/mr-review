import { memo } from "react";
import { formatBranchRange } from "@entities/mr";
import { MRItemButton, MRItemHeadline, MRItemMeta } from "./MRItemParts";
import type { MR } from "@entities/mr";

export type MRListItemProps = {
  mr: MR;
  isSelected: boolean;
  onSelect: (mr: MR) => void;
};

const MRListItemComponent = ({ mr, isSelected, onSelect }: MRListItemProps): React.ReactElement => (
  <MRItemButton
    isSelected={isSelected}
    onClick={() => {
      onSelect(mr);
    }}
    title={formatBranchRange(mr.source_branch, mr.target_branch) ?? undefined}
  >
    <MRItemHeadline mr={mr} isSelected={isSelected} />
    <MRItemMeta mr={mr} />
  </MRItemButton>
);

export const MRListItem = memo(MRListItemComponent);
