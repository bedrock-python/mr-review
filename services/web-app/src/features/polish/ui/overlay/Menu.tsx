import { useId } from "react";
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@shared/lib";
import { Kbd } from "@shared/ui";

const SIDE_OFFSET_PX = 4;
const COLLISION_PADDING_PX = 8;

export type MenuProps = {
  /** The button that opens the menu; it receives the trigger props and the ref. */
  trigger: React.ReactElement;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  align?: "start" | "center" | "end";
  /** Keys the open menu handles beyond Radix's (arrows, Home/End, typeahead, Esc). */
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Names the menu for assistive tech when its first label does not. */
  "aria-label"?: string;
  children: React.ReactNode;
};

/**
 * A dropdown menu on Radix: arrow keys and typeahead inside, Esc and a click outside close
 * it, focus goes back to the trigger.
 */
export const Menu = ({
  trigger,
  isOpen,
  onOpenChange,
  align = "start",
  onKeyDown,
  "aria-label": ariaLabel,
  children,
}: MenuProps): React.ReactElement => (
  <MenuPrimitive.Root
    {...(isOpen === undefined ? {} : { open: isOpen })}
    {...(onOpenChange === undefined ? {} : { onOpenChange })}
  >
    <MenuPrimitive.Trigger asChild>{trigger}</MenuPrimitive.Trigger>
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        sideOffset={SIDE_OFFSET_PX}
        collisionPadding={COLLISION_PADDING_PX}
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className={cn(
          "z-(--z-popover) min-w-[220px] p-(--space-1)",
          "border-border-strong bg-bg-2 rounded-(--radius-card) border",
          "shadow-(--shadow-pop)",
          "data-[state=open]:animate-[ui-fade-in_var(--dur-base)_var(--ease-out)]"
        )}
      >
        {children}
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  </MenuPrimitive.Root>
);

export type MenuItemProps = {
  onSelect: () => void;
  /** A 14px icon or a severity dot before the label. */
  icon?: React.ReactNode;
  /** A key that does the same while the menu is open. */
  shortcut?: string;
  isDisabled?: boolean;
  "aria-label"?: string;
  children: React.ReactNode;
};

export const MenuItem = ({
  onSelect,
  icon,
  shortcut,
  isDisabled = false,
  "aria-label": ariaLabel,
  children,
}: MenuItemProps): React.ReactElement => (
  <MenuPrimitive.Item
    disabled={isDisabled}
    aria-label={ariaLabel}
    onSelect={onSelect}
    className={cn(
      "flex min-h-(--control-md) cursor-pointer items-center gap-(--space-2) px-(--space-2) select-none",
      "text-fg-1 rounded-(--radius-control) text-(length:--fs-control)",
      "data-[highlighted]:bg-bg-3 data-[highlighted]:text-fg-0",
      "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
      // Items take the focus ring inside: the menu clips anything outside them.
      "focus-visible:-outline-offset-2"
    )}
  >
    {icon !== undefined && (
      <span
        className="text-fg-2 inline-flex w-(--icon-inline) shrink-0 justify-center"
        aria-hidden="true"
      >
        {icon}
      </span>
    )}
    <span className="min-w-0 flex-1 truncate">{children}</span>
    {shortcut !== undefined && (
      <span aria-hidden="true">
        <Kbd>{shortcut}</Kbd>
      </span>
    )}
  </MenuPrimitive.Item>
);

export type MenuGroupProps = {
  /** Shown as an eyebrow over the items and names the group. */
  label: React.ReactNode;
  children: React.ReactNode;
};

export const MenuGroup = ({ label, children }: MenuGroupProps): React.ReactElement => {
  const labelId = useId();
  return (
    <MenuPrimitive.Group aria-labelledby={labelId}>
      <MenuPrimitive.Label
        id={labelId}
        className="ui-eyebrow px-(--space-2) pt-(--space-2) pb-(--space-1)"
      >
        {label}
      </MenuPrimitive.Label>
      {children}
    </MenuPrimitive.Group>
  );
};

export const MenuSeparator = (): React.ReactElement => (
  <MenuPrimitive.Separator className="bg-border -mx-(--space-1) my-(--space-1) h-px" />
);
