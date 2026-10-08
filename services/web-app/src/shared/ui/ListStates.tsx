import { describeLoadError, formatListStatus } from "@shared/lib";
import type { ListStatusParams } from "@shared/lib";
import { Button } from "./button";
import { Callout } from "./callout";
import { Spinner } from "./loading";
import { ErrorState } from "./state";

export type LoadMoreRowProps =
  | { state: "loading" }
  | { state: "error"; message: string; onRetry: () => void }
  | { state: "paused"; message: string; onLoadMore: () => void };

/** Tail row of an infinite list: next page in flight, failed, or paused. */
export const LoadMoreRow = (props: LoadMoreRowProps): React.ReactElement => {
  if (props.state === "loading") {
    return (
      <div role="status" className="ui-load-more">
        <Spinner size="sm" tone="muted" isDecorative />
        Loading more…
      </div>
    );
  }
  if (props.state === "error") {
    return (
      <div role="alert" className="ui-load-more ui-load-more--error">
        <span>{props.message}</span>
        <Button size="sm" onClick={props.onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  return (
    <div className="ui-load-more">
      <span>{props.message}</span>
      <Button size="sm" onClick={props.onLoadMore}>
        Load more
      </Button>
    </div>
  );
};

export type ListStatusBarProps = ListStatusParams;

/**
 * How much of a paginated list is here, at its foot: "Showing 37 · more below", "7 of 52
 * shown", "Showing 37 · Load more below" while auto-loading is paused. Empty once the list is
 * complete and nothing is filtered out; the live region itself always stays, so a line that
 * appears is still announced.
 */
export const ListStatusBar = (props: ListStatusBarProps): React.ReactElement => {
  const status = formatListStatus(props);
  return (
    <div aria-live="polite" className="ui-list-status">
      {status !== null && <p className="ui-list-status__line">{status}</p>}
    </div>
  );
};

export type ListLoadErrorProps = {
  error: unknown;
  /** What the list holds, for the title: "merge requests", "repositories". */
  what: string;
  onRetry: () => void;
};

/** A list's first page that failed, in place of its rows: what, why in the host's words, Retry. */
export const ListLoadError = ({ error, what, onRetry }: ListLoadErrorProps): React.ReactElement => {
  const { title, message } = describeLoadError(error, what);
  return <ErrorState size="sm" title={title} message={message} onRetry={onRetry} />;
};

export type RefreshErrorNoteProps = {
  /** What failed to refresh: "the list", "the repositories". */
  what: string;
  /** The error's message, if there is one to show. */
  message: string | undefined;
  onRetry: () => void;
};

/** A refresh that failed over a loaded list: the rows stay, this says they may be old. */
export const RefreshErrorNote = ({
  what,
  message,
  onRetry,
}: RefreshErrorNoteProps): React.ReactElement => (
  <Callout
    tone="danger"
    size="sm"
    className="m-(--space-2)"
    actions={
      <Button size="sm" onClick={onRetry}>
        Retry
      </Button>
    }
  >
    Could not refresh {what}
    {message === undefined ? "." : ` — ${message}`}
  </Callout>
);
