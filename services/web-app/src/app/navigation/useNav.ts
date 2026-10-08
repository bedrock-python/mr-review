import { useLocation, useNavigate } from "react-router-dom";
import type { ReviewStage } from "@entities/review";

export type NavState = {
  selectedHostId: string | null;
  selectedRepoPath: string | null;
  selectedMRIid: number | null;
  activeReviewId: string | null;
  /** The review stage named in the URL; null when the URL names none. */
  activeStage: ReviewStage | null;
  /** The iteration named in the URL; null when the URL names none. */
  activeIterationId: string | null;
  isInbox: boolean;
};

export type NavigateOptions = {
  /** Replace the current history entry instead of adding one (redirects, URL clean-up). */
  replace?: boolean;
};

export type ReviewStageTarget = {
  stage: ReviewStage;
  /** Omitted keeps the iteration in the URL. */
  iterationId?: string | null;
  /** Switch to this review as well; omitted keeps the review in the URL. */
  reviewId?: string;
};

export type ReviewLocation = {
  hostId: string;
  repoPath: string;
  /** Null for a review that is not backed by a merge request (a branch diff). */
  mrIid: number | null;
  reviewId: string;
};

export type NavActions = {
  setHost: (id: string) => void;
  setRepo: (hostId: string, repoPath: string) => void;
  setMR: (hostId: string, repoPath: string, mrIid: number) => void;
  /**
   * Opens another review, or none; the stage and iteration of the previous one are dropped
   * and left for the stage bar to pick.
   */
  setReview: (id: string | null, options?: NavigateOptions) => void;
  /** Moves the open review to a stage and iteration in one history entry. */
  goToStage: (target: ReviewStageTarget, options?: NavigateOptions) => void;
  openReview: (target: ReviewLocation) => void;
  setInbox: (hostId: string) => void;
  clearMR: () => void;
};

const INBOX_SEGMENT = "~inbox";
const REVIEW_PARAM = "review";
const STAGE_PARAM = "stage";
const ITERATION_PARAM = "it";

const REVIEW_STAGES: readonly ReviewStage[] = ["pick", "brief", "dispatch", "polish", "post"];

const parseStage = (raw: string | null): ReviewStage | null =>
  REVIEW_STAGES.find((stage) => stage === raw) ?? null;

export const buildRepoPath = (hostId: string, repoPath: string): string =>
  `/${encodeURIComponent(hostId)}/${encodeURIComponent(repoPath)}`;

export const buildMRPath = (hostId: string, repoPath: string, mrIid: number): string =>
  `${buildRepoPath(hostId, repoPath)}/mrs/${String(mrIid)}`;

const parsePath = (
  pathname: string
): { hostId: string | null; repoPath: string | null; mrIid: number | null; isInbox: boolean } => {
  // Strip leading slash, split by "/"
  const raw = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  if (!raw) return { hostId: null, repoPath: null, mrIid: null, isInbox: false };

  const segments = raw.split("/");
  const hostId = decodeURIComponent(segments[0] ?? "");
  if (!hostId) return { hostId: null, repoPath: null, mrIid: null, isInbox: false };

  // /{hostId}/~inbox
  if (segments.length === 2 && segments[1] === INBOX_SEGMENT) {
    return { hostId, repoPath: null, mrIid: null, isInbox: true };
  }

  // Look for /mrs/<iid> sentinel from the end
  const mrsIdx = segments.lastIndexOf("mrs");
  if (mrsIdx > 1 && mrsIdx === segments.length - 2) {
    const mrIidRaw = segments[mrsIdx + 1];
    const mrIid = mrIidRaw ? parseInt(mrIidRaw, 10) : NaN;
    const repoPathEncoded = segments.slice(1, mrsIdx).join("/");
    const repoPath = decodeURIComponent(repoPathEncoded);
    return {
      hostId,
      repoPath: repoPath || null,
      mrIid: isNaN(mrIid) ? null : mrIid,
      isInbox: false,
    };
  }

  // No /mrs/ segment — just host + optional repo
  if (segments.length === 1) {
    return { hostId, repoPath: null, mrIid: null, isInbox: false };
  }

  const repoPathEncoded = segments.slice(1).join("/");
  return {
    hostId,
    repoPath: decodeURIComponent(repoPathEncoded),
    mrIid: null,
    isInbox: false,
  };
};

type SearchPatch = Partial<Record<string, string | null>>;

type CurrentLocation = { pathname: string; search: string };

// React Router hands out the location of the last render. A stage change issued after an
// await (a save, a review being created) or right after another navigation would build on
// that stale copy and undo the newer URL — or, after the user switched MRs meanwhile, move
// them back. The browser's own URL is always current: BrowserRouter writes it synchronously.
const readCurrentLocation = (fallback: CurrentLocation): CurrentLocation =>
  typeof window === "undefined"
    ? fallback
    : { pathname: window.location.pathname, search: window.location.search };

const applySearchPatch = (search: string, patch: SearchPatch): string => {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const next = params.toString();
  return next ? `?${next}` : "";
};

export const useNav = (): NavState & NavActions => {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const searchParams = new URLSearchParams(location.search);

  const { hostId, repoPath, mrIid, isInbox } = parsePath(pathname);

  const selectedHostId = hostId;
  const selectedRepoPath = repoPath;
  const selectedMRIid = mrIid;
  const activeReviewId = searchParams.get(REVIEW_PARAM);
  const activeStage = parseStage(searchParams.get(STAGE_PARAM));
  const activeIterationId = searchParams.get(ITERATION_PARAM);

  // Changes the query of the page and review this hook rendered for. A call that arrives
  // after the user moved on (an await finishing late) is dropped instead of being applied
  // to, or navigating back from, what they are on now. The review counts as well as the
  // path: the branch diff reviews of a repository all open on the repository's path.
  const patchSearch = (patch: SearchPatch, options?: NavigateOptions): void => {
    const current = readCurrentLocation(location);
    if (current.pathname !== pathname) return;
    if (new URLSearchParams(current.search).get(REVIEW_PARAM) !== activeReviewId) return;
    const search = applySearchPatch(current.search, patch);
    if (search === current.search) return;
    void navigate({ pathname: current.pathname, search }, { replace: options?.replace ?? false });
  };

  const setHost = (id: string): void => {
    void navigate(`/${encodeURIComponent(id)}/${INBOX_SEGMENT}`);
  };

  const setRepo = (hId: string, rPath: string): void => {
    void navigate(buildRepoPath(hId, rPath));
  };

  const setMR = (hId: string, rPath: string, iid: number): void => {
    void navigate(buildMRPath(hId, rPath, iid));
  };

  const setReview = (id: string | null, options?: NavigateOptions): void => {
    patchSearch({ [REVIEW_PARAM]: id, [STAGE_PARAM]: null, [ITERATION_PARAM]: null }, options);
  };

  const goToStage = (target: ReviewStageTarget, options?: NavigateOptions): void => {
    patchSearch(
      {
        [REVIEW_PARAM]: target.reviewId,
        [STAGE_PARAM]: target.stage,
        [ITERATION_PARAM]: target.iterationId,
      },
      options
    );
  };

  const openReview = (target: ReviewLocation): void => {
    const path =
      target.mrIid === null
        ? buildRepoPath(target.hostId, target.repoPath)
        : buildMRPath(target.hostId, target.repoPath, target.mrIid);
    void navigate({ pathname: path, search: applySearchPatch("", { review: target.reviewId }) });
  };

  const setInbox = (hId: string): void => {
    void navigate(`/${encodeURIComponent(hId)}/${INBOX_SEGMENT}`);
  };

  const clearMR = (): void => {
    if (selectedHostId && selectedRepoPath) {
      void navigate(buildRepoPath(selectedHostId, selectedRepoPath));
    } else if (selectedHostId) {
      void navigate(`/${encodeURIComponent(selectedHostId)}`);
    } else {
      void navigate("/");
    }
  };

  return {
    selectedHostId,
    selectedRepoPath,
    selectedMRIid,
    activeReviewId,
    activeStage,
    activeIterationId,
    isInbox,
    setHost,
    setRepo,
    setMR,
    setReview,
    goToStage,
    openReview,
    setInbox,
    clearMR,
  };
};
