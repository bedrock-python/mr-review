import { cn } from "@shared/lib";

export type TagProps = {
  /** The identifier, as it is: case and punctuation kept. */
  children: string;
  className?: string;
};

/**
 * An identifier as a chip — a model id, a file path, a branch — in mono with its case kept
 * (ids are case-sensitive; a Badge uppercases). Cut with an ellipsis when long; the full text
 * is its title.
 */
export const Tag = ({ children, className }: TagProps): React.ReactElement => (
  <span className={cn("ui-tag", className)} title={children}>
    {children}
  </span>
);
