/**
 * `localStorage` access that never throws. Reads fail when storage is disabled
 * (private mode, blocked cookies); writes fail with `QuotaExceededError` once the
 * quota is used up — the persisted query cache can fill it. Callers treat stored
 * values as preferences, so a failure just means "nothing stored".
 */

export const readStorageItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Returns false when the value could not be stored. */
export const writeStorageItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};
