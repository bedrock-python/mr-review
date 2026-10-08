import { cn } from "@shared/lib";
import { CountBadge } from "../badge";
import { Eyebrow } from "./Eyebrow";

export type SectionHeaderProps = {
  /** Drawn as the eyebrow (mono 10, small caps); write it in sentence case. */
  title: React.ReactNode;
  /** The heading level in the page outline; "div" when it is a label, not a heading. */
  as?: "h2" | "h3" | "h4" | "div";
  /** For `aria-labelledby` on the section it heads. */
  id?: string;
  count?: number;
  /** Read instead of the bare count: "3 files". */
  countLabel?: string;
  /** One line under the title. */
  description?: React.ReactNode;
  /** Right end: small buttons, a toggle, a link. */
  actions?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

/** The title row of a section or panel: eyebrow, optional count, actions on the right. */
export const SectionHeader = ({
  title,
  as = "h3",
  id,
  count,
  countLabel,
  description,
  actions,
  className,
  style,
}: SectionHeaderProps): React.ReactElement => (
  <div className={cn("ui-section-header", className)} style={style}>
    <div className="ui-section-header__titles">
      <div className="ui-section-header__title-row">
        <Eyebrow as={as} {...(id === undefined ? {} : { id })}>
          {title}
        </Eyebrow>
        {count !== undefined && (
          <CountBadge count={count} {...(countLabel === undefined ? {} : { label: countLabel })} />
        )}
      </div>
      {description !== undefined && <p className="ui-section-header__description">{description}</p>}
    </div>
    {actions !== undefined && <div className="ui-section-header__actions">{actions}</div>}
  </div>
);
