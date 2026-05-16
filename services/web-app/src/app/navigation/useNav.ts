import { useNavigate, useLocation, useSearchParams } from "react-router-dom";

export type NavState = {
  selectedHostId: string | null;
  selectedRepoPath: string | null;
  selectedMRIid: number | null;
  activeReviewId: string | null;
  isInbox: boolean;
};

export type NavActions = {
  setHost: (id: string) => void;
  setRepo: (hostId: string, repoPath: string) => void;
  setMR: (hostId: string, repoPath: string, mrIid: number) => void;
  setReview: (id: string | null) => void;
  setInbox: (hostId: string) => void;
  clearMR: () => void;
};

const INBOX_SEGMENT = "~inbox";

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

export const useNav = (): NavState & NavActions => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const { hostId, repoPath, mrIid, isInbox } = parsePath(pathname);

  const selectedHostId = hostId;
  const selectedRepoPath = repoPath;
  const selectedMRIid = mrIid;
  const activeReviewId = searchParams.get("review");

  const setHost = (id: string): void => {
    void navigate(`/${encodeURIComponent(id)}/${INBOX_SEGMENT}`);
  };

  const setRepo = (hId: string, rPath: string): void => {
    void navigate(`/${encodeURIComponent(hId)}/${encodeURIComponent(rPath)}`);
  };

  const setMR = (hId: string, rPath: string, iid: number): void => {
    void navigate(`/${encodeURIComponent(hId)}/${encodeURIComponent(rPath)}/mrs/${String(iid)}`);
  };

  const setReview = (id: string | null): void => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === null) {
        next.delete("review");
      } else {
        next.set("review", id);
      }
      return next;
    });
  };

  const setInbox = (hId: string): void => {
    void navigate(`/${encodeURIComponent(hId)}/${INBOX_SEGMENT}`);
  };

  const clearMR = (): void => {
    if (selectedHostId && selectedRepoPath) {
      void navigate(
        `/${encodeURIComponent(selectedHostId)}/${encodeURIComponent(selectedRepoPath)}`
      );
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
    isInbox,
    setHost,
    setRepo,
    setMR,
    setReview,
    setInbox,
    clearMR,
  };
};
