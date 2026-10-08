import { memo } from "react";
import { formatBranchRange } from "@entities/mr";
import { MRDiffStats, MRItemAuthor, MRItemButton, MRItemTitle, MRItemTopLine } from "./MRItemParts";
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
    <MRItemTopLine mr={mr} />
    <MRItemTitle title={mr.title} isSelected={isSelected} />

    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <MRItemAuthor author={mr.author} />
      <MRDiffStats mr={mr} />
    </div>
  </MRItemButton>
);

export const MRListItem = memo(MRListItemComponent);
