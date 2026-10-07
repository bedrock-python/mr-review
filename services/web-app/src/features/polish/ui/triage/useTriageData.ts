import { useMemo } from "react";
import {
  GENERAL_FILE_KEY,
  buildTriageRows,
  countBySeverity,
  matchesFilters,
  matchesNonSeverityFilters,
} from "../../lib";
import type { FileFilterOption } from "./TriageFilterBar";
import type { CommentFilters, SeverityCounts, TriageRow } from "../../lib";
import type { Comment } from "@entities/review";

type UseTriageDataArgs = {
  comments: readonly Comment[];
  filters: CommentFilters;
  editingId: string | null;
  isGrouped: boolean;
  collapsedGroups: ReadonlySet<string>;
};

export type TriageData = {
  /** Comments matching the filters — what bulk actions apply to. */
  matching: Comment[];
  rows: TriageRow[];
  /** Comment ids in on-screen order, for keyboard navigation. */
  visibleIds: string[];
  severityCounts: SeverityCounts;
  fileOptions: FileFilterOption[];
};

const buildFileOptions = (comments: readonly Comment[]): FileFilterOption[] => {
  const counts = new Map<string, number>();
  for (const comment of comments) {
    const key = comment.file ?? GENERAL_FILE_KEY;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const general = counts.get(GENERAL_FILE_KEY);
  counts.delete(GENERAL_FILE_KEY);
  const files = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, count]) => ({ value, label: value, count }));
  return general === undefined
    ? files
    : [{ value: GENERAL_FILE_KEY, label: "General notes", count: general }, ...files];
};

export const useTriageData = ({
  comments,
  filters,
  editingId,
  isGrouped,
  collapsedGroups,
}: UseTriageDataArgs): TriageData => {
  const matching = useMemo(
    () => comments.filter((comment) => matchesFilters(comment, filters)),
    [comments, filters]
  );

  // The comment being edited stays on screen even if an edit or a new filter excludes it,
  // so a draft is never unmounted from under the user.
  const shown = useMemo(() => {
    const editing = comments.find((c) => c.id === editingId);
    return editing === undefined || matching.includes(editing) ? matching : [...matching, editing];
  }, [comments, editingId, matching]);

  const rows = useMemo(
    () => buildTriageRows(shown, isGrouped, collapsedGroups),
    [shown, isGrouped, collapsedGroups]
  );

  const visibleIds = useMemo(
    () => rows.flatMap((row) => (row.kind === "comment" ? [row.comment.id] : [])),
    [rows]
  );

  const severityCounts = useMemo(
    () => countBySeverity(comments.filter((c) => matchesNonSeverityFilters(c, filters))),
    [comments, filters]
  );

  const fileOptions = useMemo(() => buildFileOptions(comments), [comments]);

  return { matching, rows, visibleIds, severityCounts, fileOptions };
};
