import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@shared/lib";
import { ICON_SIZE } from "../ICON_SIZE";

export type DisclosureProps = {
  title: React.ReactNode;
  /**
   * Shown after the title even while closed: "2 of 7 files excluded", a "2 changed" badge.
   * Part of the button's name, so keep it short.
   */
  summary?: React.ReactNode;
  /** Controlled: the caller owns the state (it can open the section from elsewhere). */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** Uncontrolled: the state to start with. */
  defaultIsOpen?: boolean;
  /**
   * section: a full-width header with a rule above it and an eyebrow title, for a part of a
   * stage (Brief → Advanced). inline: a compact chevron link inside a card or under a list.
   */
  variant?: "section" | "inline";
  /** The heading level around the button; "none" when the title is not a heading. */
  headingLevel?: "h2" | "h3" | "h4" | "none";
  className?: string;
  /** Mounted only while open. */
  children: React.ReactNode;
};

/**
 * Content that opens and closes under its title: a button (inside a heading) with
 * `aria-expanded` and `aria-controls`, a chevron that turns, the content mounted only while
 * open. Controlled with `isOpen` + `onOpenChange`, or uncontrolled with `defaultIsOpen`.
 */
export const Disclosure = ({
  title,
  summary,
  isOpen: controlledIsOpen,
  onOpenChange,
  defaultIsOpen = false,
  variant = "section",
  headingLevel = "h3",
  className,
  children,
}: DisclosureProps): React.ReactElement => {
  const id = useId();
  const [ownIsOpen, setOwnIsOpen] = useState(defaultIsOpen);
  const isOpen = controlledIsOpen ?? ownIsOpen;
  const hasSummary = summary !== undefined && summary !== null && summary !== false;

  const handleToggle = (): void => {
    if (controlledIsOpen === undefined) setOwnIsOpen(!isOpen);
    onOpenChange?.(!isOpen);
  };

  const button = (
    <button
      id={`${id}-button`}
      type="button"
      aria-expanded={isOpen}
      aria-controls={`${id}-panel`}
      onClick={handleToggle}
      className="ui-disclosure__trigger"
    >
      <ChevronRight size={ICON_SIZE.inline} aria-hidden="true" className="ui-disclosure__chevron" />
      <span className={variant === "section" ? "ui-eyebrow" : "ui-disclosure__title"}>{title}</span>
      {/* The space is for the accessible name ("Advanced 2 changed"); flex layout drops it. */}
      {hasSummary && " "}
      {hasSummary && <span className="ui-disclosure__summary">{summary}</span>}
    </button>
  );
  const Heading = headingLevel === "none" ? null : headingLevel;
  const Root = variant === "section" ? "section" : "div";

  return (
    <Root
      {...(variant === "section" ? { "aria-labelledby": `${id}-button` } : {})}
      className={cn("ui-disclosure", `ui-disclosure--${variant}`, className)}
    >
      {Heading === null ? button : <Heading className="ui-disclosure__heading">{button}</Heading>}
      {/* Always in the DOM, so aria-controls points at something; its content only while open. */}
      <div id={`${id}-panel`} className="ui-disclosure__panel" hidden={!isOpen}>
        {isOpen && children}
      </div>
    </Root>
  );
};
