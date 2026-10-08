const InboxIcon = (): React.ReactElement => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden="true"
  >
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

export type InboxEntryProps = {
  isActive: boolean;
  onOpen: () => void;
};

export const InboxEntry = ({ isActive, onOpen }: InboxEntryProps): React.ReactElement => (
  <div style={{ padding: "8px 0 6px" }}>
    <div className={isActive ? "row-btn active" : "row-btn"} style={{ paddingLeft: 10 }}>
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={isActive}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flex: 1,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "inherit",
          padding: 0,
        }}
      >
        <span style={{ color: "var(--fg-2)", display: "flex" }}>
          <InboxIcon />
        </span>
        <span style={{ fontSize: 12 }}>Inbox</span>
      </button>
    </div>
  </div>
);
