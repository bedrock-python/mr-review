import { Plus } from "lucide-react";
import { cn } from "@shared/lib";
import { Button, ICON_SIZE, IconButton, Tooltip } from "@shared/ui";

const LOCKED_REASON = "This iteration was posted; it can't take new comments";
/** The look IconButton gives `disabled`, for one that is only aria-disabled. */
const LOCKED_ICON_BUTTON_CLASS = "cursor-not-allowed opacity-40 hover:bg-transparent";

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
  const handleClick = (): void => {
    if (!isLocked) onAdd();
  };
  const icon = <Plus size={ICON_SIZE.inline} aria-hidden="true" />;

  if (isCompact) {
    return (
      <IconButton
        size="sm"
        variant="secondary"
        label="New comment"
        {...(isLocked ? { tooltip: LOCKED_REASON } : { shortcut: "n" })}
        aria-disabled={isLocked ? true : undefined}
        className={cn(isLocked && LOCKED_ICON_BUTTON_CLASS)}
        icon={icon}
        onClick={handleClick}
      />
    );
  }
  return (
    <Tooltip
      content={isLocked ? LOCKED_REASON : "New comment"}
      {...(isLocked ? {} : { shortcut: "n" })}
    >
      <Button
        size="sm"
        icon={icon}
        aria-disabled={isLocked ? true : undefined}
        onClick={handleClick}
      >
        New comment
      </Button>
    </Tooltip>
  );
};
