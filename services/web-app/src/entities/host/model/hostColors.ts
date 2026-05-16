export const HOST_COLORS = [
  { id: "gray", value: "var(--fg-2)", label: "Gray" },
  { id: "orange", value: "#fc6d26", label: "Orange" },
  { id: "amber", value: "#fb923c", label: "Amber" },
  { id: "yellow", value: "#eab308", label: "Yellow" },
  { id: "green", value: "#609926", label: "Green" },
  { id: "teal", value: "#14b8a6", label: "Teal" },
  { id: "blue", value: "#0052cc", label: "Blue" },
  { id: "indigo", value: "#6366f1", label: "Indigo" },
  { id: "purple", value: "#a855f7", label: "Purple" },
  { id: "pink", value: "#ec4899", label: "Pink" },
] as const;

export type HostColorId = (typeof HOST_COLORS)[number]["id"];

export const getHostColor = (colorId: HostColorId | undefined): string => {
  if (!colorId) return HOST_COLORS[0].value;
  return HOST_COLORS.find((c) => c.id === colorId)?.value ?? HOST_COLORS[0].value;
};
