import { useId } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@shared/lib";
import { ICON_SIZE } from "@shared/ui";

export type DisclosureProps = {
  title: string;
  /** Shown at the right end of the header even while closed: "2 of 7 files excluded". */
  summary?: React.ReactNode;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  children: React.ReactNode;
};

/**
 * A section that opens and closes under a full-width header: a button inside a heading, a
 * chevron that turns, the content mounted only while open.
 */
export const Disclosure = ({
  title,
  summary,
  isOpen,
  onOpenChange,
  children,
}: DisclosureProps): React.ReactElement => {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-button`} className="border-border border-t">
      <h2 className="m-0">
        <button
          id={`${id}-button`}
          type="button"
          aria-expanded={isOpen}
          aria-controls={`${id}-panel`}
          onClick={() => {
            onOpenChange(!isOpen);
          }}
          className="text-fg-2 hover:text-fg-0 flex w-full cursor-pointer items-center text-left transition-colors"
          style={{
            gap: "var(--space-2)",
            minHeight: "var(--control-lg)",
            paddingBlock: "var(--space-2)",
            transitionDuration: "var(--dur-fast)",
          }}
        >
          <ChevronRight
            size={ICON_SIZE.inline}
            aria-hidden="true"
            className={cn("shrink-0 transition-transform", isOpen && "rotate-90")}
          />
          <span className="ui-eyebrow">{title}</span>
          {summary !== undefined && summary !== null && (
            <span className="text-fg-2 ml-auto font-mono" style={{ fontSize: "var(--fs-meta)" }}>
              {summary}
            </span>
          )}
        </button>
      </h2>
      {isOpen && (
        <div id={`${id}-panel`} style={{ paddingBlock: "var(--space-2) var(--space-4)" }}>
          {children}
        </div>
      )}
    </section>
  );
};
