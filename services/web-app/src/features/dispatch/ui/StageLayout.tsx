import { StageFooter } from "@shared/ui";

import type { StageFooterProps } from "@shared/ui";

/** Width of the Dispatch content column; the footer lines its content up with it. */
export const DISPATCH_COLUMN_WIDTH = "660px";

/** The stage's scrolling area: one centred column. */
export const StageBody = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
        maxWidth: "calc(var(--dispatch-column) + 2 * var(--space-5))",
        margin: "0 auto",
        padding: "var(--space-6) var(--space-5)",
      }}
    >
      {children}
    </div>
  </div>
);

/** The stage footer, its summary and actions lined up with the column above. */
export const ColumnFooter = (props: Omit<StageFooterProps, "className">): React.ReactElement => (
  <StageFooter
    {...props}
    className="px-[max(var(--space-5),calc((100%_-_var(--dispatch-column))_/_2))]"
  />
);
