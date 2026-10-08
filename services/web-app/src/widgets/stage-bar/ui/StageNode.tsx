import { Check } from "lucide-react";
import { cn } from "@shared/lib";
import { Spinner } from "@shared/ui";

/**
 * active: the lime node; done: a check on the accent tint; open: an outlined number that can be
 * opened; locked: the same outline, dimmed by the tab.
 */
export type StageLook = "active" | "done" | "open" | "locked";

const NODE_CLASS: Record<StageLook, string> = {
  active: "bg-accent text-accent-ink",
  done: "bg-(--accent-tint) text-accent-fg",
  open: "border border-border-control text-fg-1",
  locked: "border border-border-strong text-fg-2",
};

export type StageNodeProps = {
  look: StageLook;
  number: number;
  /** The stage is being prepared (Brief creating its iteration). */
  isPending: boolean;
};

const CHECK_SIZE = 12;

const renderMark = ({ look, number, isPending }: StageNodeProps): React.ReactNode => {
  if (isPending) return <Spinner size="sm" tone="current" isDecorative />;
  if (look === "done") return <Check size={CHECK_SIZE} strokeWidth={2.5} />;
  return number;
};

/** The round marker in front of a stage's label. */
export const StageNode = (props: StageNodeProps): React.ReactElement => (
  <span
    aria-hidden="true"
    className={cn(
      "flex size-(--control-sm) shrink-0 items-center justify-center rounded-full font-mono",
      "text-(length:--fs-meta) font-semibold transition-colors duration-(--dur-base)",
      NODE_CLASS[props.look]
    )}
  >
    {renderMark(props)}
  </span>
);
