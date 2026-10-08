import { Dialog, Eyebrow, Kbd } from "@shared/ui";
import { TRIAGE_SHORTCUT_GROUPS } from "./shortcuts";

type ShortcutsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const ShortcutsDialog = ({ isOpen, onClose }: ShortcutsDialogProps): React.ReactElement => (
  <Dialog
    isOpen={isOpen}
    onClose={onClose}
    size="lg"
    title="Keyboard shortcuts"
    description="Work through the list without leaving the keyboard. Keys are ignored while you type."
  >
    <div className="grid grid-cols-2 gap-x-(--space-8) gap-y-(--space-5)">
      {TRIAGE_SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} className="flex flex-col gap-(--space-1)">
          <Eyebrow as="h3">{group.title}</Eyebrow>
          <ul className="m-0 flex list-none flex-col p-0">
            {group.shortcuts.map(({ keys, description }) => (
              <li
                key={description}
                className="border-border flex min-h-(--control-md) items-center justify-between gap-(--space-3) border-b last:border-b-0"
              >
                <span className="text-fg-1 text-(length:--fs-control)">{description}</span>
                <span className="flex shrink-0 gap-(--space-1)">
                  {keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  </Dialog>
);
