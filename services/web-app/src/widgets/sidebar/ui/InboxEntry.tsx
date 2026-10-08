import { Inbox } from "lucide-react";
import { ICON_SIZE } from "@shared/ui";
import { sidebarRowClassName } from "./sidebarRow";

export type InboxEntryProps = {
  isActive: boolean;
  onOpen: () => void;
};

/** The host's inbox: its merge requests across repositories, above the repositories. */
export const InboxEntry = ({ isActive, onOpen }: InboxEntryProps): React.ReactElement => (
  <div className="pt-(--space-2) pb-(--space-1)">
    <div className={sidebarRowClassName(isActive)}>
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={isActive}
        className="flex min-h-(--control-md) flex-1 items-center gap-(--space-2) px-(--space-3) text-(length:--fs-control)"
      >
        <Inbox size={ICON_SIZE.inline} aria-hidden="true" className="text-fg-2" />
        Inbox
      </button>
    </div>
  </div>
);
