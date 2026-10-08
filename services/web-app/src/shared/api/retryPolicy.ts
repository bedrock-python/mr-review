import { ZodError } from "zod";
import { ApiError } from "./http-client";

/** Attempts after the first one for a failure that may go away by itself. */
export const MAX_QUERY_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 30_000;
const BASE_RETRY_DELAY_MS = 1_000;
const HTTP_SERVER_ERROR_MIN = 500;

/**
 * Whether a failed query is worth sending again.
 *
 * Not when the answer cannot change (a 4xx, a response that does not match its schema),
 * not after a timeout (the server is still working on the first request, and a retry only
 * makes it do that work again), and not for anything but a GET: a POST used as a query
 * (`/prompt`) is real work on the server each time.
 */
export const isRetryableError = (error: unknown): boolean => {
  if (error instanceof ZodError) return false;
  if (!(error instanceof ApiError)) return true;
  if (error.method !== null && error.method !== "get") return false;
  if (error.kind === "timeout") return false;
  if (error.kind === "network") return true;
  return error.status >= HTTP_SERVER_ERROR_MIN;
};

export const shouldRetryQuery = (failureCount: number, error: unknown): boolean =>
  failureCount < MAX_QUERY_RETRIES && isRetryableError(error);

export const queryRetryDelay = (failureCount: number): number =>
  Math.min(BASE_RETRY_DELAY_MS * 2 ** failureCount, MAX_RETRY_DELAY_MS);
