/**
 * Copies a local folder path to the clipboard so the user can paste it
 * into the OS file manager address bar.
 *
 * Returns true on success, false if the Clipboard API is unavailable
 * (e.g. non-HTTPS context) or the path is empty.
 */
export const copyFolderPath = async (path: string | undefined): Promise<boolean> => {
  if (!path) return false;
  try {
    await navigator.clipboard.writeText(path);
    return true;
  } catch {
    return false;
  }
};
