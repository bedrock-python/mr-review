import { useId } from "react";

import { Card } from "@shared/ui";

export type StepCardProps = {
  step: number;
  title: string;
  /** Next to the title: a counter, a status. */
  aside?: React.ReactNode;
  /** Right end of the header: small buttons. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
};

/** One numbered step of the Copy & paste flow; use inside an <ol>. */
export const StepCard = ({
  step,
  title,
  aside,
  actions,
  children,
}: StepCardProps): React.ReactElement => {
  const titleId = useId();
  return (
    <Card as="li" padding="md" aria-labelledby={titleId}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: "var(--space-5)",
            height: "var(--space-5)",
            borderRadius: "var(--radius-pill)",
            border: "1px solid var(--border-strong)",
            background: "var(--bg-2)",
            color: "var(--fg-1)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-meta)",
            fontWeight: "var(--fw-semibold)",
          }}
        >
          {step}
        </span>
        <h3
          id={titleId}
          style={{
            margin: 0,
            fontSize: "var(--fs-body)",
            fontWeight: "var(--fw-semibold)",
            color: "var(--fg-0)",
          }}
        >
          {title}
        </h3>
        {aside}
        {actions !== undefined && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              marginLeft: "auto",
            }}
          >
            {actions}
          </div>
        )}
      </div>
      {children !== undefined && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            marginTop: "var(--space-3)",
            // Under the title, not under the step number.
            paddingLeft: "calc(var(--space-5) + var(--space-3))",
          }}
        >
          {children}
        </div>
      )}
    </Card>
  );
};
