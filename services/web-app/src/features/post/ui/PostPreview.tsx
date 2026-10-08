import { Braces, Download, FileCode, ListTree, MessageSquare } from "lucide-react";
import { Button, CountBadge, EmptyState, ICON_SIZE, SectionHeader } from "@shared/ui";
import { groupByFile } from "../lib/groupByFile";
import { PostCommentRow } from "./PostCommentRow";
import { TRUNCATE } from "./postStyles";
import type { FileGroup } from "../lib/groupByFile";
import type { PostCommentRowProps } from "./PostCommentRow";
import type { Comment, SeverityLabel } from "@entities/review";

export type PostPreviewMode = "dryrun" | "status";

const HEADER: Record<PostPreviewMode | "json", { title: string; description: string }> = {
  dryrun: {
    title: "Dry run",
    description: "What goes to the MR, as it will read there. Nothing is sent until you post.",
  },
  json: { title: "JSON", description: "The payload that Save as JSON downloads." },
  status: { title: "On the MR", description: "What became of each comment." },
};

const GROUP_HEADER: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  padding: "var(--space-2) var(--space-4)",
  background: "var(--bg-1)",
  borderTop: "1px solid var(--border)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-meta)",
  color: "var(--fg-1)",
};

const Group = ({
  group,
  rowProps,
}: {
  group: FileGroup;
  rowProps: Omit<PostCommentRowProps, "comment">;
}): React.ReactElement => {
  const name = group.file ?? "General notes";
  const Icon = group.file === null ? MessageSquare : FileCode;
  const count = group.comments.length;
  return (
    <section aria-label={name}>
      <div style={GROUP_HEADER}>
        <Icon
          size={ICON_SIZE.inline}
          aria-hidden="true"
          style={{ flexShrink: 0, color: "var(--fg-3)" }}
        />
        <span style={{ ...TRUNCATE, flex: 1 }} title={name}>
          {name}
        </span>
        <CountBadge
          count={count}
          label={`${String(count)} ${count === 1 ? "comment" : "comments"}`}
        />
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {group.comments.map((comment) => (
          <PostCommentRow key={comment.id} comment={comment} {...rowProps} />
        ))}
      </ul>
    </section>
  );
};

const PayloadActions = ({
  isJsonShown,
  onToggleJson,
  onSaveAsJson,
}: {
  isJsonShown: boolean;
  onToggleJson: () => void;
  onSaveAsJson: () => void;
}): React.ReactElement => (
  <>
    <Button
      size="sm"
      icon={
        isJsonShown ? (
          <ListTree size={ICON_SIZE.inline} aria-hidden="true" />
        ) : (
          <Braces size={ICON_SIZE.inline} aria-hidden="true" />
        )
      }
      onClick={onToggleJson}
    >
      {isJsonShown ? "View dry run" : "View JSON"}
    </Button>
    <Button
      size="sm"
      icon={<Download size={ICON_SIZE.inline} aria-hidden="true" />}
      onClick={onSaveAsJson}
    >
      Save as JSON
    </Button>
  </>
);

export type PostPreviewProps = {
  mode: PostPreviewMode;
  comments: Comment[];
  json: string;
  isJsonShown: boolean;
  onToggleJson: () => void;
  onSaveAsJson: () => void;
  /** The iteration is done: a comment without a record was posted, not skipped. */
  isCompleted: boolean;
  severityLabel: SeverityLabel;
};

/** The right-hand column: the dry run file by file, the raw JSON, or what became of each comment. */
export const PostPreview = ({
  mode,
  comments,
  json,
  isJsonShown,
  onToggleJson,
  onSaveAsJson,
  isCompleted,
  severityLabel,
}: PostPreviewProps): React.ReactElement => {
  const isJson = mode === "dryrun" && isJsonShown;
  const rowProps = { isStatusShown: mode === "status", isCompleted, severityLabel };
  const header = HEADER[isJson ? "json" : mode];
  const count = comments.length;

  return (
    <section
      aria-label="Preview"
      style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}
    >
      <SectionHeader
        as="h2"
        title={header.title}
        count={count}
        countLabel={`${String(count)} ${count === 1 ? "comment" : "comments"}`}
        description={header.description}
        style={{ flexShrink: 0, padding: "var(--space-4) var(--space-4) var(--space-3)" }}
        actions={
          mode === "dryrun" ? (
            <PayloadActions
              isJsonShown={isJsonShown}
              onToggleJson={onToggleJson}
              onSaveAsJson={onSaveAsJson}
            />
          ) : undefined
        }
      />

      {isJson ? (
        <pre
          role="region"
          aria-label="Payload as JSON"
          tabIndex={0}
          style={{
            flex: 1,
            margin: 0,
            padding: "var(--space-3) var(--space-4)",
            overflow: "auto",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-1)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-meta)",
            lineHeight: "var(--lh-body)",
            color: "var(--fg-1)",
          }}
        >
          {json}
        </pre>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {count === 0 ? (
            <EmptyState
              size="sm"
              title="No kept comments"
              description="Kept comments show up here."
            />
          ) : (
            groupByFile(comments).map((group) => (
              <Group key={group.file ?? ""} group={group} rowProps={rowProps} />
            ))
          )}
        </div>
      )}
    </section>
  );
};
