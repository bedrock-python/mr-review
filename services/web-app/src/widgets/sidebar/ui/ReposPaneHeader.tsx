import { SearchField } from "@shared/ui";
import type { Host } from "@entities/host";

export type ReposPaneHeaderProps = {
  host: Host | undefined;
  search: string;
  onSearchChange: (value: string) => void;
  isSearchBusy: boolean;
  canAddRepo: boolean;
  onAddRepo: () => void;
};

export const ReposPaneHeader = ({
  host,
  search,
  onSearchChange,
  isSearchBusy,
  canAddRepo,
  onAddRepo,
}: ReposPaneHeaderProps): React.ReactElement => (
  <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border)" }}>
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-0)", lineHeight: 1.3 }}>
        {host?.name ?? "No host selected"}
      </div>
      {host && (
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--fg-3)",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {host.base_url}
        </div>
      )}
    </div>

    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <SearchField
        value={search}
        onValueChange={onSearchChange}
        placeholder="Search repos…"
        ariaLabel="Search repositories"
        isBusy={isSearchBusy}
      />
      <button
        type="button"
        title="Add repository by URL"
        aria-label="Add repository by URL"
        disabled={!canAddRepo}
        onClick={onAddRepo}
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          cursor: canAddRepo ? "pointer" : "not-allowed",
          color: canAddRepo ? "var(--fg-0)" : "var(--fg-3)",
          opacity: canAddRepo ? 1 : 0.5,
          padding: 0,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  </div>
);
