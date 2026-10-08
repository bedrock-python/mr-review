import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAddRepoByUrl } from "@entities/host";
import { useReturnFocus } from "@shared/lib";
import { AddRepoFormSchema } from "../model";
import type { AddRepoFormValues } from "../model";

export type AddRepoByUrlModalProps = {
  isOpen: boolean;
  hostId: string | null;
  onClose: () => void;
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--fg-2)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

export const AddRepoByUrlModal = ({
  isOpen,
  hostId,
  onClose,
}: AddRepoByUrlModalProps): React.ReactElement => {
  const addRepo = useAddRepoByUrl();
  const handleCloseAutoFocus = useReturnFocus(isOpen);
  const form = useForm<AddRepoFormValues>({
    resolver: zodResolver(AddRepoFormSchema),
    defaultValues: { url: "" },
  });

  const handleClose = (): void => {
    form.reset({ url: "" });
    onClose();
  };

  const handleSubmit = ({ url }: AddRepoFormValues): void => {
    if (!hostId) return;
    addRepo.mutate(
      { hostId, url },
      {
        onSuccess: () => {
          handleClose();
        },
      }
    );
  };

  const isSubmitDisabled = !hostId || form.formState.isSubmitting || addRepo.isPending;
  const urlError = form.formState.errors.url;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
          }}
        />
        <Dialog.Content
          className="card"
          onCloseAutoFocus={handleCloseAutoFocus}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 51,
            width: 448,
            maxWidth: "calc(100vw - 32px)",
            padding: 24,
            boxShadow: "var(--shadow)",
          }}
        >
          <Dialog.Title
            style={{ color: "var(--fg-0)", fontSize: 14, fontWeight: 600, margin: "0 0 6px" }}
          >
            Add repository by URL
          </Dialog.Title>
          <Dialog.Description style={{ color: "var(--fg-2)", fontSize: 11, margin: "0 0 20px" }}>
            Pin a repository the host token can read — even if you are not a member.
          </Dialog.Description>

          <form
            onSubmit={(e) => {
              void form.handleSubmit(handleSubmit)(e);
            }}
            noValidate
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="add-repo-url" style={labelStyle}>
                Repository URL or owner/repo
              </label>
              <input
                id="add-repo-url"
                type="text"
                {...form.register("url")}
                aria-invalid={urlError ? true : undefined}
                aria-describedby={urlError ? "add-repo-url-error" : undefined}
                placeholder="https://github.com/torvalds/linux"
                style={{
                  background: "var(--bg-2)",
                  border: `1px solid ${urlError ? "var(--c-critical)" : "var(--border)"}`,
                  borderRadius: 6,
                  padding: "7px 10px",
                  fontSize: 13,
                  color: "var(--fg-0)",
                  fontFamily: "var(--font-mono)",
                  outline: "none",
                  width: "100%",
                }}
              />
              {urlError && (
                <p
                  id="add-repo-url-error"
                  role="alert"
                  style={{ fontSize: 11, color: "var(--c-critical)", margin: 0 }}
                >
                  {urlError.message}
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="btn primary"
                style={{ flex: 1, justifyContent: "center" }}
              >
                {addRepo.isPending ? "Adding…" : "Pin repository"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
