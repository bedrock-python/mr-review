const MS_PER_HOUR = 1000 * 60 * 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_MONTH = 30;

/** "just now", "5h ago", "14d ago", "3mo ago". */
export const formatAge = (dateStr: string): string => {
  const diffHours = Math.floor((Date.now() - new Date(dateStr).getTime()) / MS_PER_HOUR);
  if (diffHours < 1) return "just now";
  if (diffHours < HOURS_PER_DAY) return `${String(diffHours)}h ago`;
  const diffDays = Math.floor(diffHours / HOURS_PER_DAY);
  if (diffDays < DAYS_PER_MONTH) return `${String(diffDays)}d ago`;
  return `${String(Math.floor(diffDays / DAYS_PER_MONTH))}mo ago`;
};
