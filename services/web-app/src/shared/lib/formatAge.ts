const MS_PER_HOUR = 1000 * 60 * 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_MONTH = 30;

/** How long ago, compact: "now", "5h", "14d", "3mo". */
export const formatAge = (iso: string, now: number = Date.now()): string => {
  const hours = Math.floor((now - new Date(iso).getTime()) / MS_PER_HOUR);
  if (hours < 1) return "now";
  if (hours < HOURS_PER_DAY) return `${String(hours)}h`;
  const days = Math.floor(hours / HOURS_PER_DAY);
  if (days < DAYS_PER_MONTH) return `${String(days)}d`;
  return `${String(Math.floor(days / DAYS_PER_MONTH))}mo`;
};

/** How long ago, as words: "just now", "5h ago", "14d ago". */
export const formatAgeAgo = (iso: string, now: number = Date.now()): string => {
  const age = formatAge(iso, now);
  return age === "now" ? "just now" : `${age} ago`;
};
