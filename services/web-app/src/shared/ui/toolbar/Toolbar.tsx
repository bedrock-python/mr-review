import { cn } from "@shared/lib";

export type ToolbarProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 44px (md, a stage's first row) or 40px (sm, a second row or a panel header). */
  size?: "sm" | "md";
  /** The bottom border that separates it from the content under it. */
  hasBorder?: boolean;
  ref?: React.Ref<HTMLDivElement>;
};

/**
 * A row of controls above a list or a stage: view switch, search, filters, actions.
 * Not an ARIA toolbar (that would promise arrow-key navigation between the controls); with
 * an aria-label it is a named group.
 */
export const Toolbar = ({
  size = "md",
  hasBorder = true,
  className,
  ref,
  ...rest
}: ToolbarProps): React.ReactElement => (
  <div
    role={
      rest["aria-label"] !== undefined || rest["aria-labelledby"] !== undefined
        ? "group"
        : undefined
    }
    {...rest}
    ref={ref}
    className={cn(
      "ui-toolbar",
      size === "sm" && "ui-toolbar--sm",
      !hasBorder && "ui-toolbar--flush",
      className
    )}
  />
);

/** Pushes what follows to the right end of the toolbar. */
export const ToolbarSpacer = (): React.ReactElement => (
  <span className="ui-toolbar__spacer" aria-hidden="true" />
);

/** A thin vertical rule between groups of controls. */
export const ToolbarDivider = (): React.ReactElement => (
  <span className="ui-toolbar__divider" aria-hidden="true" />
);
