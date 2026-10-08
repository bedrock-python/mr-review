const PERCENT = 100;

export type BudgetMeterProps = {
  used: number;
  budget: number;
  /** Something was cut to fit: the bar turns to the warning colour. */
  isCut: boolean;
};

/** How much of the prompt budget the prompt takes, as a number and a bar. */
export const BudgetMeter = ({ used, budget, isCut }: BudgetMeterProps): React.ReactElement => {
  const share = budget > 0 ? Math.min(used / budget, 1) : 0;
  const percent = Math.round(share * PERCENT);
  const shareText = `${String(percent)}% of the budget`;

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
      <div
        className="flex items-baseline justify-between font-mono"
        style={{ gap: "var(--space-3)", fontSize: "var(--fs-meta)" }}
      >
        <span className="text-fg-1">
          {`${used.toLocaleString()} of ${budget.toLocaleString()} characters`}
        </span>
        <span className={isCut ? "text-c-major-fg" : "text-fg-2"}>{shareText}</span>
      </div>
      <div
        role="meter"
        aria-label="Prompt budget used"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={Math.min(used, budget)}
        aria-valuetext={shareText}
        className="overflow-hidden"
        style={{
          height: "var(--space-1)",
          borderRadius: "var(--radius-pill)",
          background: "var(--bg-3)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: used > 0 ? `max(${String(share * PERCENT)}%, var(--space-1))` : 0,
            borderRadius: "var(--radius-pill)",
            background: isCut ? "var(--c-warn)" : "var(--accent)",
          }}
        />
      </div>
    </div>
  );
};
