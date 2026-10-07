import { SEVERITY_RANK } from "./severity";
import type { Comment, CommentSeverity } from "@entities/review";

export type StatusFilter = "all" | "kept" | "dismissed";

/** File filter value that selects comments without a file (general notes). */
export const GENERAL_FILE_KEY = "__general__";

export type CommentFilters = {
  severities: readonly CommentSeverity[];
  status: StatusFilter;
  /** `null` = every file, `GENERAL_FILE_KEY` = general notes only, otherwise a path. */
  file: string | null;
  search: string;
};

export const EMPTY_FILTERS: CommentFilters = {
  severities: [],
  status: "all",
  file: null,
  search: "",
};

export type SeverityCounts = Record<CommentSeverity, number>;

export type CommentGroup = {
  key: string;
  label: string;
  comments: Comment[];
};

export type TriageRow =
  | { kind: "group"; group: CommentGroup; isCollapsed: boolean }
  | { kind: "comment"; comment: Comment };

const matchesSearch = (comment: Comment, needle: string): boolean =>
  needle.length === 0 ||
  comment.body.toLowerCase().includes(needle) ||
  (comment.file?.toLowerCase().includes(needle) ?? false);

const matchesFile = (comment: Comment, file: string | null): boolean => {
  if (file === null) return true;
  if (file === GENERAL_FILE_KEY) return comment.file === null;
  return comment.file === file;
};

const matchesStatus = (comment: Comment, status: StatusFilter): boolean =>
  status === "all" || comment.status === status;

/** Every filter except severity — the severity chips show counts for this facet. */
export const matchesNonSeverityFilters = (comment: Comment, filters: CommentFilters): boolean =>
  matchesStatus(comment, filters.status) &&
  matchesFile(comment, filters.file) &&
  matchesSearch(comment, filters.search.trim().toLowerCase());

export const matchesFilters = (comment: Comment, filters: CommentFilters): boolean =>
  (filters.severities.length === 0 || filters.severities.includes(comment.severity)) &&
  matchesNonSeverityFilters(comment, filters);

export const isFiltering = (filters: CommentFilters): boolean =>
  filters.severities.length > 0 ||
  filters.status !== "all" ||
  filters.file !== null ||
  filters.search.trim().length > 0;

// General notes first: they read as the review's summary.
const compareFile = (a: Comment, b: Comment): number => {
  if (a.file === b.file) return 0;
  if (a.file === null) return -1;
  if (b.file === null) return 1;
  return a.file.localeCompare(b.file);
};

const compareLine = (a: Comment, b: Comment): number => (a.line ?? 0) - (b.line ?? 0);

const compareSeverity = (a: Comment, b: Comment): number =>
  SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];

/** Flat order: severity, then file, then line. `Array.prototype.sort` is stable. */
export const sortBySeverity = (comments: readonly Comment[]): Comment[] =>
  [...comments].sort((a, b) => compareSeverity(a, b) || compareFile(a, b) || compareLine(a, b));

export const groupByFile = (comments: readonly Comment[]): CommentGroup[] => {
  const groups = new Map<string, Comment[]>();
  for (const comment of [...comments].sort(
    (a, b) => compareFile(a, b) || compareLine(a, b) || compareSeverity(a, b)
  )) {
    const key = comment.file ?? GENERAL_FILE_KEY;
    const bucket = groups.get(key);
    if (bucket) bucket.push(comment);
    else groups.set(key, [comment]);
  }
  return [...groups.entries()].map(([key, groupComments]) => ({
    key,
    label: key === GENERAL_FILE_KEY ? "General notes" : key,
    comments: groupComments,
  }));
};

export const buildTriageRows = (
  comments: readonly Comment[],
  isGrouped: boolean,
  collapsedGroups: ReadonlySet<string>
): TriageRow[] => {
  if (!isGrouped) {
    return sortBySeverity(comments).map((comment) => ({ kind: "comment", comment }));
  }
  return groupByFile(comments).flatMap((group): TriageRow[] => {
    const isCollapsed = collapsedGroups.has(group.key);
    const header: TriageRow = { kind: "group", group, isCollapsed };
    if (isCollapsed) return [header];
    return [header, ...group.comments.map((comment): TriageRow => ({ kind: "comment", comment }))];
  });
};

export const countBySeverity = (comments: readonly Comment[]): SeverityCounts => {
  const counts: SeverityCounts = { critical: 0, major: 0, minor: 0, suggestion: 0 };
  for (const comment of comments) counts[comment.severity] += 1;
  return counts;
};
