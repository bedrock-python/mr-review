import { useState } from "react";
import { useMRs } from "@entities/mr";
import type { MRStatus } from "@entities/mr";
import { useNav } from "@app/navigation";
import { Skeleton } from "@shared/ui";
import { MRListItem } from "./MRListItem";

const MRListSkeleton = (): React.ReactElement => (
  <div style={{ padding: "6px 0" }}>
    {Array.from({ length: 5 }, (_, i) => (
      <div
        key={i}
        style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Skeleton style={{ width: 36, height: 14, borderRadius: 999 }} />
          <Skeleton
            style={{ width: `${String(60 + (i % 3) * 20)}px`, height: 14, borderRadius: 4 }}
          />
        </div>
        <Skeleton style={{ width: "85%", height: 13, borderRadius: 4 }} />
        <Skeleton style={{ width: "50%", height: 11, borderRadius: 4 }} />
      </div>
    ))}
  </div>
);

type FilterChip = { label: string; value: string };

const FILTER_CHIPS: FilterChip[] = [
  { label: "All", value: "all" },
  { label: "Assigned", value: "assigned" },
  { label: "Authored", value: "authored" },
  { label: "Draft", value: "draft" },
  { label: "Ready", value: "ready" },
];

const SORT_OPTIONS = [
  { label: "Updated", value: "updated" },
  { label: "Created", value: "created" },
  { label: "Title", value: "title" },
];

const SearchIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const MRList = (): React.ReactElement => {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("updated");
  const [search, setSearch] = useState("");
  const { selectedHostId, selectedRepoPath, selectedMRIid, setMR } = useNav();

  const statusFilter: MRStatus = "opened";
  const {
    data: mrs,
    isLoading,
    isError,
  } = useMRs(selectedHostId, selectedRepoPath, { status: statusFilter });

  const filtered =
    mrs?.filter((mr) => {
      if (search && !mr.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "draft") return mr.draft;
      if (filter === "ready") return !mr.draft;
      return true;
    }) ?? [];

  return (
    <section
      aria-label="Merge Requests"
      style={{
        width: 360,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--border)",
        background: "var(--bg-0)",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Filter chips */}
      <div
        style={{
          padding: "10px 12px 8px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
        }}
      >
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => {
              setFilter(chip.value);
            }}
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              border: `1px solid ${filter === chip.value ? "var(--accent)" : "var(--border)"}`,
              background: filter === chip.value ? "var(--accent)" : "transparent",
              color: filter === chip.value ? "var(--accent-ink)" : "var(--fg-1)",
              cursor: "pointer",
              transition: "all 0.08s",
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Search + Sort row */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "5px 8px",
          }}
        >
          <span style={{ color: "var(--fg-3)", flexShrink: 0 }}>
            <SearchIcon />
          </span>
          <input
            type="search"
            placeholder="Search MRs…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            aria-label="Search merge requests"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 12,
              color: "var(--fg-0)",
              minWidth: 0,
            }}
          />
        </div>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
          }}
          aria-label="Sort by"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "5px 8px",
            fontSize: 11,
            color: "var(--fg-1)",
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
            outline: "none",
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!selectedRepoPath && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 80,
              color: "var(--fg-3)",
              fontSize: 12,
              textAlign: "center",
              padding: "0 20px",
            }}
          >
            Select a repository to see merge requests
          </div>
        )}

        {selectedRepoPath && isLoading && <MRListSkeleton />}

        {selectedRepoPath && isError && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 80,
              color: "var(--fg-3)",
              fontSize: 12,
              textAlign: "center",
              padding: "0 20px",
            }}
          >
            Failed to load merge requests
          </div>
        )}

        {selectedRepoPath && !isLoading && filtered.length === 0 && !isError && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 80,
              color: "var(--fg-3)",
              fontSize: 12,
              textAlign: "center",
              padding: "0 20px",
            }}
          >
            No merge requests found
          </div>
        )}

        {filtered.map((mr) => (
          <MRListItem
            key={mr.iid}
            mr={mr}
            isSelected={selectedMRIid === mr.iid}
            onClick={() => {
              if (selectedHostId && selectedRepoPath)
                setMR(selectedHostId, selectedRepoPath, mr.iid);
            }}
          />
        ))}
      </div>
    </section>
  );
};
