import { useQuery } from "@tanstack/react-query";
import { systemApi } from "@shared/api";
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
};

export type Versions = {
  frontend: ComponentVersion;
  backend: ComponentVersion;
  isAnyUpdateAvailable: boolean;
  /** Looking for updates (GitHub) right now. */
  isChecking: boolean;
  /** GitHub could not be asked: offline or air-gapped. The versions are still known. */
  hasCheckFailed: boolean;
  /** How this install is run, which decides how it is updated. */
  deploymentMode: DeploymentMode;
};

// The same query as Settings' storage section, so the two share one request.
const SYSTEM_INFO_KEY = ["system-info"] as const;

const updateOf = (info: ComponentUpdateInfo | null | undefined): ComponentUpdateInfo | null =>
  info?.isUpdateAvailable === true ? info : null;

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
  const { data: updates, isFetching, isError } = useCheckUpdate();
  const frontendUpdate = updateOf(updates?.frontend);
  const backendUpdate = updateOf(updates?.backend);

  return {
    frontend: { component: "frontend", current: __APP_VERSION__, update: frontendUpdate },
    backend: {
      component: "backend",
      current: system?.backend_version ?? null,
      update: backendUpdate,
    },
    isAnyUpdateAvailable: frontendUpdate !== null || backendUpdate !== null,
    isChecking: isFetching,
    hasCheckFailed: isError,
    deploymentMode: updates?.deploymentMode ?? system?.deployment_mode ?? "standard",
  };
};
