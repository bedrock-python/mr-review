import { useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn, useStableCallback } from "@shared/lib";
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
  /**
   * Keep the content in the page while closed (hidden), so the browser's find-in-page reaches
   * it and opens the section on a match (`hidden="until-found"` where supported). For light
   * content people search for: the built-in presets, a list of repository names. Heavy or
   * stateful content stays unmounted while closed.
   */
  shouldKeepMounted?: boolean;
  className?: string;
  /** Mounted only while open, unless `shouldKeepMounted`. */
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
  shouldKeepMounted = false,
  className,
  children,
}: DisclosureProps): React.ReactElement => {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [ownIsOpen, setOwnIsOpen] = useState(defaultIsOpen);
  const isOpen = controlledIsOpen ?? ownIsOpen;
  const hasSummary = summary !== undefined && summary !== null && summary !== false;

  const setOpen = (next: boolean): void => {
    if (controlledIsOpen === undefined) setOwnIsOpen(next);
    onOpenChange?.(next);
  };
  const handleToggle = (): void => {
    setOpen(!isOpen);
  };
  const handleBeforeMatch = useStableCallback((): void => {
    setOpen(true);
  });

  // React has no `hidden="until-found"` yet: set it by hand, and open when the browser's
  // find-in-page matches inside (the `beforematch` event).
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!shouldKeepMounted || panel === null) return undefined;
    if (isOpen) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", "until-found");
    panel.addEventListener("beforematch", handleBeforeMatch);
    return () => {
      panel.removeEventListener("beforematch", handleBeforeMatch);
    };
  }, [isOpen, shouldKeepMounted, handleBeforeMatch]);

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
      {/* Always in the DOM, so aria-controls points at something; its content while open, or
          always (hidden while closed) with shouldKeepMounted. */}
      <div
        ref={panelRef}
        id={`${id}-panel`}
        className="ui-disclosure__panel"
        {...(shouldKeepMounted ? {} : { hidden: !isOpen })}
      >
        {(isOpen || shouldKeepMounted) && children}
      </div>
    </Root>
  );
};
