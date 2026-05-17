import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAddRepoByUrl } from "@entities/host";
import { AddRepoFormSchema } from "../model";
import type { AddRepoFormValues } from "../model";

export type AddRepoByUrlModalProps = {
  isOpen: boolean;
  hostId: string | null;
  onClose: () => void;
};

export const AddRepoByUrlModal = ({
  isOpen,
  hostId,
  onClose,
}: AddRepoByUrlModalProps): React.ReactElement | null => {
  const addRepo = useAddRepoByUrl();
  const form = useForm<AddRepoFormValues>({
    resolver: zodResolver(AddRepoFormSchema),
    defaultValues: { url: "" },
  });

  const handleSubmit = ({ url }: AddRepoFormValues): void => {
    if (!hostId) return;
    addRepo.mutate(
      { hostId, url },
      {
        onSuccess: () => {
          form.reset({ url: "" });
          onClose();
        },
      }
    );
  };

  const handleClose = (): void => {
    form.reset({ url: "" });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add repository by URL"
    >
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        className="card relative z-10 w-full max-w-md p-6"
        style={{ boxShadow: "var(--shadow)" }}
      >
        <h2 style={{ color: "var(--fg-0)", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          Add repository by URL
        </h2>
        <p style={{ color: "var(--fg-3)", fontSize: 11, marginBottom: 20 }}>
          Pin a repository the host token can read — even if you are not a member.
        </p>

        <form
          onSubmit={(e) => {
            void form.handleSubmit(handleSubmit)(e);
          }}
          noValidate
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              htmlFor="add-repo-url"
              style={{
                fontSize: 10,
                color: "var(--fg-2)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Repository URL or owner/repo
            </label>
            <input
              id="add-repo-url"
              type="text"
              autoFocus
              {...form.register("url")}
              placeholder="https://github.com/torvalds/linux"
              style={{
                background: "var(--bg-2)",
                border: `1px solid ${form.formState.errors.url ? "var(--c-critical)" : "var(--border)"}`,
                borderRadius: 6,
                padding: "7px 10px",
                fontSize: 13,
                color: "var(--fg-0)",
                fontFamily: "var(--font-mono)",
                outline: "none",
                width: "100%",
              }}
            />
            {form.formState.errors.url && (
              <p role="alert" style={{ fontSize: 11, color: "var(--c-critical)" }}>
                {form.formState.errors.url.message}
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button
              type="button"
              onClick={handleClose}
              className="btn ghost"
              style={{ flex: 1, justifyContent: "center" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!hostId || form.formState.isSubmitting || addRepo.isPending}
              className="btn primary"
              style={{
                flex: 1,
                justifyContent: "center",
                opacity: !hostId || form.formState.isSubmitting || addRepo.isPending ? 0.5 : 1,
              }}
            >
              {addRepo.isPending ? "Adding…" : "Pin repository"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
