import { memo } from "react";
import { formatBranchRange, getRepoNameFromPath } from "@entities/mr";
import { MRDiffStats, MRItemAuthor, MRItemButton, MRItemTitle, MRItemTopLine } from "./MRItemParts";
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
    <div style={{ marginBottom: 4 }}>
      <span
        className="mono"
        title={mr.repo_path}
        style={{
          fontSize: 10,
          color: "var(--fg-3)",
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 3,
          padding: "1px 5px",
        }}
      >
        {getRepoNameFromPath(mr.repo_path)}
      </span>
    </div>

    <MRItemTopLine mr={mr} />
    <MRItemTitle title={mr.title} isSelected={isSelected} />

    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <MRItemAuthor author={mr.author} />
      <MRDiffStats mr={mr} />
    </div>
  </MRItemButton>
);

export const InboxMRListItem = memo(InboxMRListItemComponent);
