/**
 * Compare two semantic version strings (e.g., "0.1.0", "1.2.3")
 * @returns positive if v1 > v2, negative if v1 < v2, 0 if equal
 */
export const compareVersions = (v1: string, v2: string): number => {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] ?? 0;
    const num2 = parts2[i] ?? 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
};

/**
 * Check if version v1 is greater than version v2
 */
export const isNewerVersion = (v1: string, v2: string): boolean => {
  return compareVersions(v1, v2) > 0;
};
