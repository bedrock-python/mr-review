import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCheckUpdate, updateKeys } from "@features/check-update";

export const VersionBadge = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data: updateInfo, isFetching } = useCheckUpdate();

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleForceCheck = (): void => {
    void queryClient.invalidateQueries({ queryKey: updateKeys.all });
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((v) => !v);
        }}
        title="Version info"
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--fg-2)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "2px 4px",
          borderRadius: "var(--radius-1)",
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--fg-1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--fg-2)";
        }}
      >
        v{__APP_VERSION__}
        {updateInfo?.isAnyUpdateAvailable && (
          <span
            style={{
              display: "inline-block",
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "var(--accent)",
              marginLeft: 4,
              verticalAlign: "middle",
            }}
          />
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            width: 220,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-3)",
            padding: "12px 14px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            zIndex: 100,
          }}
        >
          <div style={{ fontSize: 11, color: "var(--fg-2)", marginBottom: 10 }}>Version info</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "var(--fg-2)" }}>Backend</span>
              <span
                className="mono"
                style={{
                  color: updateInfo?.backend.isUpdateAvailable ? "var(--accent-fg)" : "var(--fg-0)",
                }}
              >
                v{updateInfo?.backend.current ?? __APP_VERSION__}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "var(--fg-2)" }}>Frontend</span>
              <span
                className="mono"
                style={{
                  color: updateInfo?.frontend?.isUpdateAvailable
                    ? "var(--accent-fg)"
                    : "var(--fg-0)",
                }}
              >
                v{updateInfo?.frontend?.current ?? __APP_VERSION__}
              </span>
            </div>

            {updateInfo?.isAnyUpdateAvailable && (
              <div
                style={{
                  fontSize: 11,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 6,
                  marginTop: 2,
                  color: "var(--fg-2)",
                }}
              >
                Update available — see banner above
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleForceCheck}
            disabled={isFetching}
            style={{
              width: "100%",
              background: "var(--bg-3)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-2)",
              cursor: isFetching ? "default" : "pointer",
              color: isFetching ? "var(--fg-3)" : "var(--fg-0)",
              fontSize: 11,
              fontWeight: 500,
              padding: "5px 0",
              transition: "color 0.15s",
            }}
          >
            {isFetching ? "Checking…" : "Check for updates"}
          </button>
        </div>
      )}
    </div>
  );
};
