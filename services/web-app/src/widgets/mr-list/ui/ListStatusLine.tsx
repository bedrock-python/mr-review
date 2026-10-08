import { formatListStatus } from "../lib/listStatus";
import type { ListStatusParams } from "../lib/listStatus";

/**
 * How much of a paginated list is here, at its foot; empty when the list is complete. The
 * live region itself always stays, so a line that appears is still announced.
 */
export const ListStatusLine = (props: ListStatusParams): React.ReactElement => {
  const status = formatListStatus(props);
  return (
    <div aria-live="polite" className="shrink-0">
      {status !== null && (
        <p className="border-border text-fg-2 m-0 truncate border-t px-(--space-3) py-(--space-1) text-(length:--fs-meta) tabular-nums">
          {status}
        </p>
      )}
    </div>
  );
};
