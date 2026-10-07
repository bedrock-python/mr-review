import type { InboxScope, MRStateFilter } from "@entities/mr";

export type MRSortKey = "updated" | "created" | "title";
export type ReadinessFilter = "any" | "draft" | "ready";

export type Option<TValue extends string> = { label: string; value: TValue };

/** Repository view: maps to the server `state` filter. */
export const STATE_OPTIONS: readonly Option<MRStateFilter>[] = [
  { label: "Open", value: "opened" },
  { label: "Merged", value: "merged" },
  { label: "Closed", value: "closed" },
  { label: "All", value: "all" },
];

/** Inbox view: relationship chips map to the server `scope`. */
export const SCOPE_OPTIONS: readonly Option<InboxScope>[] = [
  { label: "All", value: "all" },
  { label: "Review requested", value: "review_requested" },
  { label: "Assigned", value: "assigned" },
  { label: "Authored", value: "authored" },
];

/** Client-side: list endpoints have no draft filter. */
export const READINESS_OPTIONS: readonly Option<Exclude<ReadinessFilter, "any">>[] = [
  { label: "Draft", value: "draft" },
  { label: "Ready", value: "ready" },
];

/** "Updated" is the server order; the others re-sort what is loaded. */
export const SORT_OPTIONS: readonly Option<MRSortKey>[] = [
  { label: "Updated", value: "updated" },
  { label: "Created", value: "created" },
  { label: "Title", value: "title" },
];

export const DEFAULT_STATE: MRStateFilter = "opened";
export const DEFAULT_SCOPE: InboxScope = "all";
export const DEFAULT_SORT: MRSortKey = "updated";
export const DEFAULT_READINESS: ReadinessFilter = "any";

type ViewableMR = { title: string; draft: boolean; created_at: string };

export type MRListViewOptions = {
  readiness: ReadinessFilter;
  sort: MRSortKey;
  /** Case-insensitive title filter applied on the client (inbox has no server search). */
  titleFilter?: string | undefined;
};

const titleCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

const matchesReadiness = (mr: ViewableMR, readiness: ReadinessFilter): boolean => {
  if (readiness === "draft") return mr.draft;
  if (readiness === "ready") return !mr.draft;
  return true;
};

const compareCreatedDesc = (a: ViewableMR, b: ViewableMR): number =>
  Date.parse(b.created_at) - Date.parse(a.created_at);

const compareTitle = (a: ViewableMR, b: ViewableMR): number =>
  titleCollator.compare(a.title, b.title);

/**
 * Applies the client-side part of the list view to the loaded items. Sorting is
 * stable, so equal keys keep the server (updated) order.
 */
export const applyMRListView = <TItem>(
  items: readonly TItem[],
  getMR: (item: TItem) => ViewableMR,
  { readiness, sort, titleFilter }: MRListViewOptions
): TItem[] => {
  const needle = titleFilter?.trim().toLowerCase() ?? "";
  const visible = items.filter((item) => {
    const mr = getMR(item);
    if (!matchesReadiness(mr, readiness)) return false;
    return needle === "" || mr.title.toLowerCase().includes(needle);
  });
  if (sort === "created") return visible.sort((a, b) => compareCreatedDesc(getMR(a), getMR(b)));
  if (sort === "title") return visible.sort((a, b) => compareTitle(getMR(a), getMR(b)));
  return visible;
};

/** True when client-side filtering may hide loaded items. */
export const isClientFiltered = ({ readiness, titleFilter }: MRListViewOptions): boolean =>
  readiness !== "any" || (titleFilter?.trim() ?? "") !== "";
