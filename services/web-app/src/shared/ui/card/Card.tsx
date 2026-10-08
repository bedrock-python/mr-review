import { cn } from "@shared/lib";

export type CardProps = React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "aside" | "li";
  /** Inner padding: 0, 12, 16 or 20px. */
  padding?: "none" | "sm" | "md" | "lg";
  /** default bg-1; sunken bg-0 (a well inside a panel); raised bg-2. */
  surface?: "default" | "sunken" | "raised";
  /** Hover border for a card that is itself clickable. Use a button or link inside for focus. */
  isInteractive?: boolean;
  ref?: React.Ref<HTMLElement>;
};

/** A bordered surface with the card radius. */
export const Card = ({
  as: Component = "div",
  padding = "md",
  surface = "default",
  isInteractive = false,
  className,
  ref,
  ...rest
}: CardProps): React.ReactElement => (
  <Component
    {...rest}
    ref={ref as React.Ref<never>}
    className={cn(
      "ui-card",
      padding !== "none" && `ui-card--pad-${padding}`,
      surface !== "default" && `ui-card--${surface}`,
      isInteractive && "ui-card--interactive",
      className
    )}
  />
);
