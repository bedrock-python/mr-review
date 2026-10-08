import { useEffect, useId, useRef, useState } from "react";
import { ListFilter } from "lucide-react";
import { ICON_SIZE, IconButton, Radio, RadioGroup } from "@shared/ui";
import { READINESS_OPTIONS } from "../lib/mrListView";
import type { ReadinessFilter as Readiness } from "../lib/mrListView";

const isReadiness = (value: string): value is Readiness =>
  READINESS_OPTIONS.some((option) => option.value === value);

export type ReadinessFilterProps = {
  value: Readiness;
  onValueChange: (value: Readiness) => void;
};

/**
 * The filter menu of the list: drafts only, ready only, or everything. A small non-modal
 * popover under its button; Esc, a press outside it or Tab away closes it.
 */
export const ReadinessFilter = ({
  value,
  onValueChange,
}: ReadinessFilterProps): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const isActive = value !== "any";
  const activeLabel = READINESS_OPTIONS.find((option) => option.value === value)?.label;

  useEffect(() => {
    if (!isOpen) return undefined;
    // The checked option takes focus, so the arrow keys work at once.
    panelRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Escape" || !isOpen) return;
    event.stopPropagation();
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Tab away closes it: focus moved to a known element outside. A blur with no new focus
  // target is not a reason: pressing on a label's text blurs its radio before the click
  // checks it, and in WebKit a click on a radio never focuses it at all.
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || rootRef.current?.contains(next)) return;
    setIsOpen(false);
  };

  return (
    <div ref={rootRef} className="relative shrink-0" onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <IconButton
        ref={triggerRef}
        variant="secondary"
        label="Filter merge requests"
        tooltip={isActive ? `Showing: ${activeLabel ?? ""}` : "Filter merge requests"}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => {
          setIsOpen((open) => !open);
        }}
        icon={<ListFilter size={ICON_SIZE.button} aria-hidden="true" />}
      />
      {isActive && (
        <span
          aria-hidden="true"
          className="bg-accent ring-bg-1 pointer-events-none absolute top-(--space-1) right-(--space-1) size-(--dot-size) rounded-full ring-2"
        />
      )}
      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Filter merge requests"
          className="border-border bg-bg-2 absolute top-full right-0 z-(--z-popover) mt-(--space-1) w-max rounded-(--radius-3) border p-(--space-3) shadow-(--shadow-pop)"
        >
          <RadioGroup
            legend="Show"
            value={value}
            onValueChange={(next) => {
              if (isReadiness(next)) onValueChange(next);
            }}
          >
            {READINESS_OPTIONS.map((option) => (
              <Radio key={option.value} value={option.value} label={option.label} />
            ))}
          </RadioGroup>
        </div>
      )}
    </div>
  );
};
