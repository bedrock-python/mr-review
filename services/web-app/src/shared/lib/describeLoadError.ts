import { getApiErrorStatus } from "./apiError";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

export type LoadErrorDescription = {
  /** What could not be done: "Could not load merge requests". */
  title: string;
  /** Why, in the host's own words; undefined when the error carried none. */
  message: string | undefined;
};

/**
 * What to say when something could not be loaded: what failed, and the server's own words.
 * A rejected token is named as such, since that is what the user has to fix.
 */
export const describeLoadError = (error: unknown, what: string): LoadErrorDescription => {
  const status = getApiErrorStatus(error);
  if (status === HTTP_UNAUTHORIZED) {
    return {
      title: "Authentication failed",
      message: "The host rejected the access token. Update it in Settings.",
    };
  }
  if (status === HTTP_FORBIDDEN) {
    return { title: "Access denied", message: `The access token cannot read these ${what}.` };
  }
  const message = error instanceof Error && error.message !== "" ? error.message : undefined;
  return { title: `Could not load ${what}`, message };
};

/** The same, on one line: "Could not load more repositories: GitLab answered 502". */
export const formatLoadError = (error: unknown, what: string): string => {
  const { title, message } = describeLoadError(error, what);
  return message === undefined ? title : `${title}: ${message}`;
};
