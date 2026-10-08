/** Saves `text` as a plain-text file named `filename` through the browser's download. */
export const downloadText = (text: string, filename: string): void => {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
