import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@shared/lib";
import { ICON_SIZE } from "../ICON_SIZE";

export type CalloutTone = "neutral" | "info" | "warn" | "danger" | "success";

export type CalloutProps = {
  tone?: CalloutTone;
  /** One short line in bold; the body can carry the rest. */
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Buttons under the body: Retry, "Use Copy & paste", a link. */
  actions?: React.ReactNode;
  /** Replaces the tone's icon; `null` for none. */
  icon?: React.ReactNode;
  size?: "sm" | "md";
  /**
   * How it is announced. Defaults: danger → "alert" (read at once), success → "status",
   * info / warn / neutral → "note" (read in place). "none" for a callout that is just layout.
   */
  role?: "alert" | "status" | "note" | "none";
  className?: string;
  style?: React.CSSProperties;
};

const TONE_ICON: Record<CalloutTone, React.ReactNode> = {
  neutral: <Info size={ICON_SIZE.button} />,
  info: <Info size={ICON_SIZE.button} />,
  warn: <TriangleAlert size={ICON_SIZE.button} />,
  danger: <CircleAlert size={ICON_SIZE.button} />,
  success: <CircleCheck size={ICON_SIZE.button} />,
};

const DEFAULT_ROLE: Record<CalloutTone, NonNullable<CalloutProps["role"]>> = {
  neutral: "note",
  info: "note",
  warn: "note",
  danger: "alert",
  success: "status",
};

/** A message inside the page: what happened, why, and what to do next. */
export const Callout = ({
  tone = "info",
  title,
  children,
  actions,
  icon,
  size = "md",
  role,
  className,
  style,
}: CalloutProps): React.ReactElement => {
  const resolvedRole = role ?? DEFAULT_ROLE[tone];
  const shownIcon = icon === undefined ? TONE_ICON[tone] : icon;
  return (
    <div
      role={resolvedRole === "none" ? undefined : resolvedRole}
      className={cn("ui-callout", size === "sm" && "ui-callout--sm", className)}
      data-tone={tone === "neutral" ? undefined : tone}
      style={style}
    >
      {shownIcon !== null && (
        <span className="ui-callout__icon" aria-hidden="true">
          {shownIcon}
        </span>
      )}
      <div className="ui-callout__content">
        {title !== undefined && <p className="ui-callout__title">{title}</p>}
        {children !== undefined && <div className="ui-callout__body">{children}</div>}
        {actions !== undefined && <div className="ui-callout__actions">{actions}</div>}
      </div>
    </div>
  );
};
