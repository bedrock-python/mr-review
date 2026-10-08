import { cn } from "@shared/lib";

export type KbdProps = {
  children: React.ReactNode;
  className?: string;
};

/** A key cap: "Esc", "⌘", "↵". */
export const Kbd = ({ children, className }: KbdProps): React.ReactElement => (
  <kbd className={cn("ui-kbd", className)}>{children}</kbd>
);
