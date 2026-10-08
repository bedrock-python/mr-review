import { ArrowLeft } from "lucide-react";
import { SeverityCounts, countSeverities } from "@entities/review";
import { Button, Callout, ICON_SIZE } from "@shared/ui";
import { PostOptions, SummaryList } from "./PostParts";
import { ASIDE, STAGE_SUBTITLE, STAGE_TITLE } from "./postStyles";
import type { PostOptionsProps } from "./PostParts";
import type { Comment } from "@entities/review";

export type PostConfirmPanelProps = PostOptionsProps & {
  kept: Comment[];
  targetLabel: string;
  hostLabel: string | null;
  onBackToPolish: () => void;
};

/** The "ready to post" column: where the comments go, how many of each, and the options. */
export const PostConfirmPanel = ({
  kept,
  targetLabel,
  hostLabel,
  onBackToPolish,
  ...options
}: PostConfirmPanelProps): React.ReactElement => {
  const inline = kept.filter((c) => c.file !== null && c.line !== null).length;
  const items = [
    { label: "Target", value: targetLabel },
    ...(hostLabel === null ? [] : [{ label: "Host", value: hostLabel }]),
    { label: "Inline comments", value: inline },
    { label: "General notes", value: kept.length - inline },
    {
      label: "Severity",
      value: kept.length > 0 ? <SeverityCounts counts={countSeverities(kept)} isCompact /> : "—",
    },
  ];

  return (
    <aside aria-label="Post summary" style={ASIDE}>
      <div>
        <h2 style={STAGE_TITLE}>Ready to post</h2>
        <p style={STAGE_SUBTITLE}>Check where the comments go, then post them to the MR.</p>
      </div>

      <SummaryList aria-label="What will be posted" items={items} />

      {kept.length === 0 && (
        <Callout
          tone="warn"
          title="Nothing to post"
          actions={
            <Button
              size="sm"
              icon={<ArrowLeft size={ICON_SIZE.inline} aria-hidden="true" />}
              onClick={onBackToPolish}
            >
              Back to Polish
            </Button>
          }
        >
          This iteration has no kept comments. Go back to Polish and keep at least one.
        </Callout>
      )}

      <PostOptions {...options} />
    </aside>
  );
};
