import { ApiError } from "@shared/api";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

export type LoadErrorDescription = { title: string; message: string | undefined };

/**
 * What to say when a list could not be loaded: what failed, and the host's own words.
 * A token problem is named as such, since that is what the user has to fix.
 */
export const describeLoadError = (error: unknown, what: string): LoadErrorDescription => {
  const status = error instanceof ApiError ? error.status : null;
  if (status === HTTP_UNAUTHORIZED) {
    return {
      title: "Authentication failed",
      message: "The host rejected the access token. Update it in Settings.",
    };
  }
  if (status === HTTP_FORBIDDEN) {
    return {
      title: "Access denied",
      message: `The access token cannot read these ${what}.`,
    };
  }
  const message = error instanceof Error && error.message !== "" ? error.message : undefined;
  return { title: `Could not load ${what}`, message };
};
