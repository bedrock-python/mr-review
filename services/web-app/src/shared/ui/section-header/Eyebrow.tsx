import { cn } from "@shared/lib";

export type EyebrowProps = {
  as?: "span" | "div" | "p" | "h2" | "h3" | "h4" | "legend";
  id?: string;
  className?: string;
  children: React.ReactNode;
};

/** The one small-caps label: mono 10/500, 0.08em tracking, uppercase, fg-2. */
export const Eyebrow = ({
  as: Component = "span",
  id,
  className,
  children,
}: EyebrowProps): React.ReactElement => (
  <Component id={id} className={cn("ui-eyebrow", className)}>
    {children}
  </Component>
);
