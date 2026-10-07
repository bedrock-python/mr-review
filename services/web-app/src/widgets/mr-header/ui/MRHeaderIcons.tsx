const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.5",
  "aria-hidden": true,
} as const;

export const ExternalLinkIcon = (): React.ReactElement => (
  <svg width="13" height="13" {...iconProps}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

export const SyncIcon = ({ isSpinning = false }: { isSpinning?: boolean }): React.ReactElement => (
  <svg
    width="13"
    height="13"
    {...iconProps}
    style={isSpinning ? { animation: "spin 0.8s linear infinite" } : undefined}
  >
    <polyline points="1 4 1 10 7 10" />
    <polyline points="23 20 23 14 17 14" />
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
  </svg>
);

export const ArrowsIcon = (): React.ReactElement => (
  <svg width="12" height="12" {...iconProps}>
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

export const HistoryIcon = (): React.ReactElement => (
  <svg width="13" height="13" {...iconProps}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export const PanelsIcon = (): React.ReactElement => (
  <svg width="14" height="14" {...iconProps}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);
