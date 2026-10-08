import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Kbd } from "./Kbd";

const OPEN_DELAY_MS = 400;
const SIDE_OFFSET_PX = 6;

export type TooltipProps = {
  /** The hint. Keep it short; it is also read as the trigger's description. */
  content: React.ReactNode;
  /** A key that does the same, shown after the hint: "Esc", "⌘↵", "?". */
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** One focusable element; it receives the trigger props (the ref included). */
  children: React.ReactElement;
};

/**
 * A hint on hover and on keyboard focus. Each tooltip brings its own provider, so it works
 * anywhere, tests included, without an app-level wrapper.
 */
export const Tooltip = ({
  content,
  shortcut,
  side = "top",
  align = "center",
  children,
}: TooltipProps): React.ReactElement => (
  <TooltipPrimitive.Provider delayDuration={OPEN_DELAY_MS}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="ui-tooltip"
          side={side}
          align={align}
          sideOffset={SIDE_OFFSET_PX}
          collisionPadding={8}
        >
          {content}
          {shortcut !== undefined && <Kbd>{shortcut}</Kbd>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
);
