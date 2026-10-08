import type { InfiniteListResult, RepoPage } from "@entities/mr";

export type HostConnection = "connecting" | "connected" | "unreachable";

/**
 * What the last repository request says about the host. There is no separate health check:
 * the list of repositories is the first thing the pane asks the host for, so its outcome is
 * the honest signal. A failed "next page" is shown in the list itself and does not count.
 */
export const hostConnectionOf = (
  query: Pick<
    InfiniteListResult<RepoPage>,
    "isError" | "isFetchNextPageError" | "isFetching" | "isSuccess"
  >
): HostConnection => {
  if (query.isError && !query.isFetchNextPageError && !query.isFetching) return "unreachable";
  if (query.isSuccess || query.isFetchNextPageError) return "connected";
  return "connecting";
};
