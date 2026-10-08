import { useNavigate } from "react-router-dom";
import { History, Plus, Settings } from "lucide-react";
import { getHostColor, useHosts } from "@entities/host";
import { useNav } from "@app/navigation";
import { useAppStore } from "@app/store";
import { cn } from "@shared/lib";
import { ICON_SIZE, IconButton, Tooltip } from "@shared/ui";
import { AddHostDialog } from "./AddHostDialog";
import { HostTypeIcon } from "./HostTypeIcon";
import type { Host, HostColorId } from "@entities/host";

/** Width of the rail; the layout around it counts on it. */
const RAIL_WIDTH_PX = 56;

/** A square in the rail: a host, or the add-host slot. */
const RAIL_TILE =
  "flex size-(--control-lg) items-center justify-center rounded-(--radius-3) transition-colors duration-(--dur-fast)";

type HostAvatarProps = {
  host: Host;
  isSelected: boolean;
  onClick: () => void;
};

/** A host: its brand mark in its colour (identity), the selection marked by the accent bar. */
const HostAvatar = ({ host, isSelected, onClick }: HostAvatarProps): React.ReactElement => (
  <div className="relative flex w-full justify-center">
    {isSelected && (
      <span
        aria-hidden="true"
        className="bg-accent-fg absolute top-1/2 left-0 h-(--space-6) w-[3px] -translate-y-1/2 rounded-r-full"
      />
    )}
    <Tooltip content={host.name} side="right">
      <button
        type="button"
        onClick={onClick}
        aria-label={`Select host: ${host.name}`}
        aria-pressed={isSelected}
        className={cn(
          RAIL_TILE,
          "border",
          isSelected
            ? "border-border-strong bg-bg-3"
            : "border-border bg-bg-2 hover:border-border-strong hover:bg-bg-3"
        )}
        style={{ color: getHostColor(host.color as HostColorId | undefined) }}
      >
        <HostTypeIcon type={host.type} size={ICON_SIZE.button} />
      </button>
    </Tooltip>
  </div>
);

/** The far-left column: home, the hosts, adding one; history and settings at the foot. */
export const HostsRail = (): React.ReactElement => {
  const isAddHostOpen = useAppStore((s) => s.addHostOpen);
  const setAddHostOpen = useAppStore((s) => s.setAddHostOpen);
  const historyOpen = useAppStore((s) => s.historyOpen);
  const toggleHistory = useAppStore((s) => s.toggleHistory);
  const { data: hosts } = useHosts();
  const { selectedHostId, setHost } = useNav();
  const navigate = useNavigate();

  return (
    <>
      <nav
        aria-label="Hosts"
        className="border-border bg-bg-1 relative z-10 flex h-full shrink-0 flex-col items-center gap-(--space-2) border-r py-(--space-3)"
        style={{ width: RAIL_WIDTH_PX }}
      >
        <Tooltip content="Home" side="right">
          <button
            type="button"
            aria-label="Home"
            onClick={() => {
              void navigate("/");
            }}
            className="bg-accent flex size-(--control-md) items-center justify-center rounded-(--radius-2) transition-[filter] duration-(--dur-fast) hover:brightness-105"
          >
            <span aria-hidden="true" className="bg-accent-ink size-(--space-2) rounded-full" />
          </button>
        </Tooltip>

        <span aria-hidden="true" className="bg-border my-(--space-1) h-px w-(--space-8)" />

        {hosts?.map((host) => (
          <HostAvatar
            key={host.id}
            host={host}
            isSelected={selectedHostId === host.id}
            onClick={() => {
              setHost(host.id);
            }}
          />
        ))}

        <Tooltip content="Add host" side="right">
          <button
            type="button"
            aria-label="Add host"
            onClick={() => {
              setAddHostOpen(true);
            }}
            className={cn(
              RAIL_TILE,
              "border-border-strong text-fg-2 hover:border-accent-fg hover:text-accent-fg border border-dashed"
            )}
          >
            <Plus size={ICON_SIZE.button} aria-hidden="true" />
          </button>
        </Tooltip>

        <div className="mt-auto flex flex-col items-center gap-(--space-1)">
          <IconButton
            label="History"
            tooltip="Review history"
            tooltipSide="right"
            isPressed={historyOpen}
            onClick={toggleHistory}
            icon={<History size={ICON_SIZE.button} aria-hidden="true" />}
          />
          <IconButton
            label="Settings"
            tooltipSide="right"
            onClick={() => {
              void navigate("/settings");
            }}
            icon={<Settings size={ICON_SIZE.button} aria-hidden="true" />}
          />
        </div>
      </nav>

      <AddHostDialog
        isOpen={isAddHostOpen}
        onClose={() => {
          setAddHostOpen(false);
        }}
      />
    </>
  );
};
