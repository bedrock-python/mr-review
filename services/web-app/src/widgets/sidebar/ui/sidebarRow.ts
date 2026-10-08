import { cn } from "@shared/lib";

/**
 * A selectable row of the repositories pane (the Inbox, a repository): hover fill, and when
 * it is the open one a raised fill with the accent bar on its leading edge. `group`, so a
 * row's secondary control (the favourite star) can show on hover.
 */
export const sidebarRowClassName = (isActive: boolean): string =>
  cn(
    "group flex w-full items-center rounded-(--radius-2) text-left",
    "transition-colors duration-(--dur-fast)",
    isActive
      ? "bg-bg-2 text-fg-0 shadow-[inset_var(--indicator-width)_0_0_var(--accent)]"
      : "text-fg-1 hover:bg-bg-hover hover:text-fg-0"
  );
