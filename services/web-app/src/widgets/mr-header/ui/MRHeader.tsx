import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppStore } from "@app/store";
import { useNav } from "@app/navigation";
import { useMR, useRepos, mrKeys } from "@entities/mr";
import { useHosts } from "@entities/host";

const ExternalLinkIcon = (): React.ReactElement => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const SyncIcon = (): React.ReactElement => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <polyline points="1 4 1 10 7 10" />
    <polyline points="23 20 23 14 17 14" />
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
  </svg>
);

const ArrowsIcon = (): React.ReactElement => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const formatAge = (dateStr: string): string => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "just now";
  if (diffHours < 24) return `${String(diffHours)}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${String(diffDays)}d ago`;
  return `${String(Math.floor(diffDays / 30))}mo ago`;
};

const PanelsIcon = (): React.ReactElement => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);

export const MRHeader = (): React.ReactElement | null => {
  const { navCollapsed, toggleNav } = useAppStore();
  const { selectedHostId, selectedRepoPath, selectedMRIid } = useNav();
  const queryClient = useQueryClient();
  const { data: hosts } = useHosts();
  const { data: repos } = useRepos(selectedHostId);
  const { data: mr } = useMR(selectedHostId, selectedRepoPath, selectedMRIid);

  if (!mr || !selectedHostId || !selectedRepoPath || !selectedMRIid) return null;

  const host = hosts?.find((h) => h.id === selectedHostId);
  const repo = repos?.find((r) => r.path === selectedRepoPath);
  const hostName = host?.name ?? selectedHostId;
  const repoName = repo?.name ?? selectedRepoPath;

  const sha = (mr as typeof mr & { sha?: string }).sha;

  const mrUrl =
    mr.web_url ||
    (() => {
      if (!host) return "";
      const base = host.base_url.replace(/\/$/, "");
      if (host.type === "github")
        return `${base}/${selectedRepoPath}/pull/${String(selectedMRIid)}`;
      return `${base}/${selectedRepoPath}/-/merge_requests/${String(selectedMRIid)}`;
    })();

  const handleSync = (): void => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: mrKeys.lists(selectedHostId, selectedRepoPath) }),
      queryClient.invalidateQueries({
        queryKey: mrKeys.detail(selectedHostId, selectedRepoPath, selectedMRIid),
      }),
    ]).then(() => {
      toast.success("MR synced");
    });
  };

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-1)",
        padding: "12px 20px 10px",
        flexShrink: 0,
      }}
    >
      {/* Breadcrumbs */}
      <div
        className="mono"
        style={{
          fontSize: 11,
          color: "var(--fg-3)",
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {navCollapsed && (
          <button
            type="button"
            onClick={toggleNav}
            title="Show navigator"
            style={{
              marginRight: 6,
              padding: "2px 4px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 4,
              cursor: "pointer",
              color: "var(--fg-3)",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <PanelsIcon />
          </button>
        )}
        <span>{hostName}</span>
        <span>›</span>
        <span>{repoName}</span>
        <span>›</span>
        <span style={{ color: "var(--fg-2)" }}>!{mr.iid}</span>
      </div>

      {/* Title + actions */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
        <h1
          style={{
            flex: 1,
            fontSize: 22,
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            color: "var(--fg-0)",
            lineHeight: 1.25,
            margin: 0,
          }}
        >
          {mr.title}
        </h1>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, paddingTop: 4 }}>
          <button
            type="button"
            className="btn ghost"
            style={{ padding: "5px 10px", gap: 6 }}
            onClick={handleSync}
          >
            <SyncIcon />
            Sync
          </button>
          {mrUrl ? (
            <a
              href={mrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn ghost"
              style={{ padding: "5px 10px", gap: 6, textDecoration: "none" }}
            >
              <ExternalLinkIcon />
              Open
            </a>
          ) : (
            <button
              type="button"
              className="btn ghost"
              style={{ padding: "5px 10px", gap: 6 }}
              disabled
            >
              <ExternalLinkIcon />
              Open
            </button>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Author */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "var(--bg-3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: "var(--fg-2)",
              border: "1px solid var(--border)",
            }}
          >
            {mr.author.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: 12, color: "var(--fg-1)" }}>{mr.author}</span>
          <span style={{ fontSize: 11, color: "var(--fg-3)" }}>{formatAge(mr.created_at)}</span>
        </div>

        <span style={{ color: "var(--border-strong)" }}>·</span>

        {/* Branch chip */}
        <span className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ArrowsIcon />
          <span className="mono" style={{ fontSize: 10 }}>
            {mr.source_branch}
          </span>
          <span style={{ color: "var(--fg-3)" }}>→</span>
          <span className="mono" style={{ fontSize: 10 }}>
            {mr.target_branch}
          </span>
        </span>

        {/* SHA */}
        {sha && (
          <span className="chip mono" style={{ fontSize: 10 }}>
            {sha.slice(0, 8)}
          </span>
        )}

        {/* Draft indicator */}
        {mr.draft && (
          <span className="chip" style={{ color: "var(--fg-3)", fontSize: 10 }}>
            DRAFT
          </span>
        )}
      </div>
    </div>
  );
};
