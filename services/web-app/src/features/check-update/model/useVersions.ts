import { useQuery } from "@tanstack/react-query";
import { systemApi } from "@shared/api";
import { getApiErrorStatus } from "@shared/lib";
import { useCheckUpdate } from "./useCheckUpdate";
import type { ComponentUpdateInfo, UpdateInfo } from "../api";

type DeploymentMode = UpdateInfo["deploymentMode"];

/** The two parts of mr-review, released apart; named the same in the badge and the banner. */
export type VersionedComponent = "frontend" | "backend";

export const COMPONENT_LABEL: Record<VersionedComponent, string> = {
  frontend: "Web app",
  backend: "API",
};

export type ComponentVersion = {
  component: VersionedComponent;
  /** The version running now; null while the API has not said. */
  current: string | null;
  /** Set when GitHub has a newer release of this part. */
  update: ComponentUpdateInfo | null;
  /**
   * The running version was compared with the latest release. Not when GitHub was out of
   * reach, nor for a web app served by a dev server, which the API cannot name.
   */
  isChecked: boolean;
};

export type Versions = {
  frontend: ComponentVersion;
  backend: ComponentVersion;
  isAnyUpdateAvailable: boolean;
  /** Looking for updates (GitHub) right now. */
  isChecking: boolean;
  /**
   * Why the last look for updates failed: GitHub out of reach (offline, air-gapped) or its
   * rate limit; null when it did not. The versions are still known either way.
   */
  checkFailure: CheckFailure | null;
  /** How this install is run, which decides how it is updated. */
  deploymentMode: DeploymentMode;
};

export type CheckFailure = "unreachable" | "rate-limited";

const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;

// GitHub answers an exhausted anonymous rate limit with 403 (or 429).
const checkFailureOf = (error: unknown): CheckFailure => {
  const status = getApiErrorStatus(error);
  return status === HTTP_FORBIDDEN || status === HTTP_TOO_MANY_REQUESTS
    ? "rate-limited"
    : "unreachable";
};

// The same query as Settings' storage section, so the two share one request.
const SYSTEM_INFO_KEY = ["system-info"] as const;

const updateOf = (info: ComponentUpdateInfo | null | undefined): ComponentUpdateInfo | null =>
  info?.isUpdateAvailable === true ? info : null;

const isCompared = (info: ComponentUpdateInfo | null | undefined): boolean =>
  info !== null && info !== undefined;

/**
 * One version story: what runs (the web app is this bundle, the API reports its own), and
 * which of the two has a newer release. Versions come from the API even when GitHub is out
 * of reach; only the update check needs GitHub.
 */
export const useVersions = (): Versions => {
  const { data: system } = useQuery({
    queryKey: SYSTEM_INFO_KEY,
    queryFn: systemApi.getInfo,
    staleTime: Infinity,
    meta: { silent: true },
  });
  const { data: updates, isFetching, isError, error } = useCheckUpdate();
  // After a failed look, the last answer may be old: nothing is called up to date on it.
  const isCheckCurrent = !isError;
  const frontendUpdate = updateOf(updates?.frontend);
  const backendUpdate = updateOf(updates?.backend);

  return {
    frontend: {
      component: "frontend",
      current: __APP_VERSION__,
      update: frontendUpdate,
      isChecked: isCheckCurrent && isCompared(updates?.frontend),
    },
    backend: {
      component: "backend",
      current: system?.backend_version ?? null,
      update: backendUpdate,
      isChecked: isCheckCurrent && isCompared(updates?.backend),
    },
    isAnyUpdateAvailable: frontendUpdate !== null || backendUpdate !== null,
    isChecking: isFetching,
    checkFailure: isError ? checkFailureOf(error) : null,
    deploymentMode: updates?.deploymentMode ?? system?.deployment_mode ?? "standard",
  };
};
