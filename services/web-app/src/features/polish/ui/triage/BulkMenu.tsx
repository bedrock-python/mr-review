import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button, ICON_SIZE } from "@shared/ui";
import { SEVERITY_KEY, SEVERITY_LABEL, SEVERITY_ORDER, SEV_COLOR } from "../../lib";
import { Menu, MenuGroup, MenuItem, MenuSeparator } from "../overlay";
import type { CommentSeverity } from "@entities/review";

type BulkMenuProps = {
  /** "shown" when filters or collapsed groups hide some comments. */
  scope: "all" | "shown";
  /** How many comments the actions apply to. */
  count: number;
  onKeepAll: () => void;
  onDismissAll: () => void;
  onSetSeverity: (severity: CommentSeverity) => void;
};

const SEVERITY_BY_KEY = new Map(
  SEVERITY_ORDER.map((severity) => [SEVERITY_KEY[severity], severity])
);

/** The menu's heading: what its actions apply to. */
const describeTarget = (scope: BulkMenuProps["scope"], count: number): string => {
  if (scope === "shown") return `${String(count)} shown ${count === 1 ? "comment" : "comments"}`;
  return count === 1 ? "1 comment" : `All ${String(count)} comments`;
};

const hasModifier = (event: React.KeyboardEvent): boolean =>
  event.altKey || event.ctrlKey || event.metaKey;

/**
 * Actions on every comment in view: keep, dismiss, set the severity. The severity items
 * answer to 1–4 while the menu is open, the keys that set one comment's severity in the list.
 */
export const BulkMenu = ({
  scope,
  count,
  onKeepAll,
  onDismissAll,
  onSetSeverity,
}: BulkMenuProps): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const target = describeTarget(scope, count);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const severity = SEVERITY_BY_KEY.get(event.key);
    if (severity === undefined || hasModifier(event) || event.nativeEvent.isComposing) return;
    event.preventDefault();
    setIsOpen(false);
    onSetSeverity(severity);
  };

  return (
    <Menu
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      align="end"
      aria-label="Bulk actions"
      onKeyDown={handleKeyDown}
      trigger={
        <Button
          size="sm"
          aria-label="Bulk actions"
          disabled={count === 0}
          iconRight={<ChevronDown size={ICON_SIZE.inline} aria-hidden="true" />}
        >
          Bulk
        </Button>
      }
    >
      <MenuGroup label={target}>
        <MenuItem
          icon={<Check size={ICON_SIZE.inline} />}
          aria-label={`Keep ${scope} comments`}
          onSelect={onKeepAll}
        >
          Keep {scope}
        </MenuItem>
        <MenuItem
          icon={<X size={ICON_SIZE.inline} />}
          aria-label={`Dismiss ${scope} comments`}
          onSelect={onDismissAll}
        >
          Dismiss {scope}
        </MenuItem>
      </MenuGroup>
      <MenuSeparator />
      <MenuGroup label="Set severity">
        {SEVERITY_ORDER.map((severity) => (
          <MenuItem
            key={severity}
            icon={
              <span
                className="ui-severity-counts__dot"
                style={{ background: SEV_COLOR[severity] }}
              />
            }
            shortcut={SEVERITY_KEY[severity]}
            aria-label={`Set ${scope} comments to ${severity}`}
            onSelect={() => {
              onSetSeverity(severity);
            }}
          >
            {SEVERITY_LABEL[severity]}
          </MenuItem>
        ))}
      </MenuGroup>
    </Menu>
  );
};
