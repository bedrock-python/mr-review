import { githubApi, extractVersion, systemApi } from "@shared/api";
import type { GithubRelease, SystemInfo } from "@shared/api";

export type ComponentUpdateInfo = {
  current: string;
  latest: string;
  isUpdateAvailable: boolean;
  release: GithubRelease;
};

export type UpdateInfo = {
  backend: ComponentUpdateInfo;
  frontend: ComponentUpdateInfo | null;
  isAnyUpdateAvailable: boolean;
  deploymentMode: SystemInfo["deployment_mode"];
};

export const checkUpdateApi = {
  checkForUpdate: async (): Promise<UpdateInfo | null> => {
    const [systemInfo, releases] = await Promise.all([
      systemApi.getInfo(),
      githubApi.getLatestReleases(),
    ]);

    if (!releases.backend) return null;

    const latestBackend = extractVersion(releases.backend.tag_name);
    const backend: ComponentUpdateInfo = {
      current: systemInfo.backend_version,
      latest: latestBackend,
      isUpdateAvailable: latestBackend !== systemInfo.backend_version,
      release: releases.backend,
    };

    let frontend: ComponentUpdateInfo | null = null;
    if (releases.frontend !== null && systemInfo.frontend_version !== null) {
      const latestFrontend = extractVersion(releases.frontend.tag_name);
      frontend = {
        current: systemInfo.frontend_version,
        latest: latestFrontend,
        isUpdateAvailable: latestFrontend !== systemInfo.frontend_version,
        release: releases.frontend,
      };
    }

    return {
      backend,
      frontend,
      isAnyUpdateAvailable: backend.isUpdateAvailable || (frontend?.isUpdateAvailable ?? false),
      deploymentMode: systemInfo.deployment_mode,
    };
  },
};
