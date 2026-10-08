import { ArrowRight, FileDiff, List, MessagesSquare } from "lucide-react";
import {
  Button,
  ICON_SIZE,
  SegmentedControl,
  Spinner,
  Toolbar,
  ToolbarDivider,
  ToolbarSpacer,
} from "@shared/ui";
import type { PolishViewMode } from "../model";
import type { Comment } from "@entities/review";
import type { SegmentedOption } from "@shared/ui";

type PolishToolbarProps = {
  comments: readonly Comment[];
  isSaving: boolean;
  viewMode: PolishViewMode;
  onViewModeChange: (mode: PolishViewMode) => void;
  onContinue: () => void;
};

const VIEW_OPTIONS: readonly SegmentedOption<PolishViewMode>[] = [
  { value: "list", label: "List", icon: <List size={ICON_SIZE.inline} aria-hidden="true" /> },
  {
    value: "pinned",
    label: "Diff + pins",
    icon: <FileDiff size={ICON_SIZE.inline} aria-hidden="true" />,
  },
  {
    value: "thread",
    label: "Thread",
    icon: <MessagesSquare size={ICON_SIZE.inline} aria-hidden="true" />,
  },
];

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? "" : "s"}`;

/** The stage's first row: how to look at the comments, what will be posted, the next step. */
export const PolishToolbar = ({
  comments,
  isSaving,
  viewMode,
  onViewModeChange,
  onContinue,
}: PolishToolbarProps): React.ReactElement => {
  const keptCount = comments.filter((c) => c.status !== "dismissed").length;

  return (
    <Toolbar size="md">
      <SegmentedControl
        aria-label="View mode"
        options={VIEW_OPTIONS}
        value={viewMode}
        onValueChange={onViewModeChange}
      />
      <ToolbarDivider />
      <span role="status" className="text-fg-2 text-(length:--fs-control) whitespace-nowrap">
        {plural(comments.length, "comment")} · {keptCount} kept
      </span>
      {isSaving && (
        <span className="text-fg-2 flex items-center gap-1.5 text-(length:--fs-meta)">
          <Spinner size="sm" tone="muted" isDecorative />
          Saving…
        </span>
      )}
      <ToolbarSpacer />
      <Button
        variant="primary"
        iconRight={<ArrowRight size={ICON_SIZE.inline} aria-hidden="true" />}
        onClick={onContinue}
      >
        Continue to post
      </Button>
    </Toolbar>
  );
};
