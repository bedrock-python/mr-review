import { Plus } from "lucide-react";
import { Button, ICON_SIZE, IconButton } from "@shared/ui";

const LOCKED_REASON = "This iteration was posted; it can't take new comments";

type NewCommentButtonProps = {
  /** Only the icon, for a narrow row. */
  isCompact: boolean;
  isLocked: boolean;
  onAdd: () => void;
};

/**
 * "New comment", with its key in the tooltip. On a posted iteration it is aria-disabled
 * rather than disabled: it stays focusable and hoverable, so the tooltip can say why.
 */
export const NewCommentButton = ({
  isCompact,
  isLocked,
  onAdd,
}: NewCommentButtonProps): React.ReactElement => {
  const icon = <Plus size={ICON_SIZE.inline} aria-hidden="true" />;
  const disabledReason = isLocked ? LOCKED_REASON : null;

  if (isCompact) {
    return (
      <IconButton
        size="sm"
        variant="secondary"
        label="New comment"
        shortcut="n"
        disabledReason={disabledReason}
        icon={icon}
        onClick={onAdd}
      />
    );
  }
  return (
    <Button
      size="sm"
      icon={icon}
      tooltip="New comment"
      shortcut="n"
      disabledReason={disabledReason}
      onClick={onAdd}
    >
      New comment
    </Button>
  );
};
