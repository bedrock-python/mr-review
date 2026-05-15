export const RouteMap = {
  // Public
  home: "/",
  login: "/login",

  // Hosts
  hosts: "/hosts",
  hostDetail: "/hosts/:hostId",

  // Repos
  repos: "/repos",
  repoDetail: "/repos/:repoId",

  // Reviews
  reviews: "/reviews",
  reviewDetail: "/reviews/:reviewId",

  // Settings & Profile
  settings: "/settings",
  profile: "/profile",
} as const;

export type RouteMap = (typeof RouteMap)[keyof typeof RouteMap];

export const createPath = (route: string, params?: Record<string, string>): string => {
  let path = route;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      path = path.replace(`:${key}`, value);
    });
  }
  return path;
};
