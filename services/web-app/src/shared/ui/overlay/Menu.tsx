import { useId } from "react";
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Kbd } from "../tooltip";

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
        // Radix names the menu by its trigger; an explicit name must win over that.
        {...(ariaLabel === undefined ? {} : { "aria-labelledby": undefined })}
        onKeyDown={onKeyDown}
        className="ui-menu"
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
    className="ui-menu__item"
  >
    {icon !== undefined && (
      <span className="ui-menu__icon" aria-hidden="true">
        {icon}
      </span>
    )}
    <span className="ui-menu__label">{children}</span>
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
      <MenuPrimitive.Label id={labelId} className="ui-eyebrow ui-menu__group-label">
        {label}
      </MenuPrimitive.Label>
      {children}
    </MenuPrimitive.Group>
  );
};

export const MenuSeparator = (): React.ReactElement => (
  <MenuPrimitive.Separator className="ui-menu__separator" />
);
