import { Inbox } from "lucide-react";
import { cn } from "@shared/lib";

export type EmptyStateProps = {
  /** What is empty, as a fact: "No open merge requests". */
  title: React.ReactNode;
  /** Why, or what to do: "Try another filter, or check a repository." */
  description?: React.ReactNode;
  /** Next steps: Clear filters, Add host. */
  actions?: React.ReactNode;
  /** A lucide icon; `null` for none. */
  icon?: React.ReactNode;
  /** sm for lists and panels, md for a whole stage or page. */
  size?: "sm" | "md";
  /** Takes the full height of its container and centres itself. */
  isFill?: boolean;
  /** A status by default, so a list that empties after filtering is announced. */
  role?: "status" | "none";
  className?: string;
};

/** Nothing to show yet, said plainly, with the way forward. */
export const EmptyState = ({
  title,
  description,
  actions,
  icon,
  size = "md",
  isFill = false,
  role = "status",
  className,
}: EmptyStateProps): React.ReactElement => {
  const shownIcon = icon === undefined ? <Inbox size={size === "sm" ? 14 : 18} /> : icon;
  return (
    <div
      role={role === "none" ? undefined : role}
      className={cn(
        "ui-state",
        size === "sm" && "ui-state--sm",
        isFill && "ui-state--fill",
        className
      )}
    >
      {shownIcon !== null && (
        <span className="ui-state__icon" aria-hidden="true">
          {shownIcon}
        </span>
      )}
      <p className="ui-state__title">{title}</p>
      {description !== undefined && <p className="ui-state__description">{description}</p>}
      {actions !== undefined && <div className="ui-state__actions">{actions}</div>}
    </div>
  );
};
