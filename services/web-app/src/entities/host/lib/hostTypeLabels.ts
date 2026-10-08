import type { HostType } from "../model/host.schema";

/** A host type as people write it. */
export const HOST_TYPE_LABELS: Record<HostType, string> = {
  gitlab: "GitLab",
  github: "GitHub",
  gitea: "Gitea",
  forgejo: "Forgejo",
  bitbucket: "Bitbucket",
};
