import { Button, Callout } from "@shared/ui";

export type ReposRefreshErrorProps = { message: string | undefined; onRetry: () => void };

/** A refresh that failed over a loaded list: the repositories stay, this says they may be old. */
export const ReposRefreshError = ({
  message,
  onRetry,
}: ReposRefreshErrorProps): React.ReactElement => (
  <Callout
    tone="danger"
    size="sm"
    className="mx-(--space-2) my-(--space-1)"
    actions={
      <Button size="sm" onClick={onRetry}>
        Retry
      </Button>
    }
  >
    Could not refresh the repositories{message === undefined ? "." : ` — ${message}`}
  </Callout>
);
