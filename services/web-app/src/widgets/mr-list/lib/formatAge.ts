const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_MONTH = 30;

/** Compact age for list rows: "today", "1d", "12d", "3mo". */
export const formatAge = (dateStr: string, now: number = Date.now()): string => {
  const diffDays = Math.floor((now - new Date(dateStr).getTime()) / MS_PER_DAY);
  if (diffDays <= 0) return "today";
  if (diffDays < DAYS_PER_MONTH) return `${String(diffDays)}d`;
  return `${String(Math.floor(diffDays / DAYS_PER_MONTH))}mo`;
};
