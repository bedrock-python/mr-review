const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_SHOWN_RELATIVE = 30;

/** "just now", "5m ago", "3h ago", "12d ago", then the date. */
export const formatRelative = (iso: string): string => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / MINUTE_MS);
  if (mins < 1) return "just now";
  if (mins < MINUTES_PER_HOUR) return `${String(mins)}m ago`;
  const hrs = Math.floor(mins / MINUTES_PER_HOUR);
  if (hrs < HOURS_PER_DAY) return `${String(hrs)}h ago`;
  const days = Math.floor(hrs / HOURS_PER_DAY);
  if (days < DAYS_SHOWN_RELATIVE) return `${String(days)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
