import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAddRepoByUrl } from "@entities/host";
import { Button, Dialog, Field, Input } from "@shared/ui";
import { AddRepoFormSchema } from "../model";
import type { AddRepoFormValues } from "../model";

export type AddRepoByUrlModalProps = {
  isOpen: boolean;
  hostId: string | null;
  onClose: () => void;
};

/** Pins a repository by its URL or path, for repositories the token can read but not list. */
export const AddRepoByUrlModal = ({
  isOpen,
  hostId,
  onClose,
}: AddRepoByUrlModalProps): React.ReactElement => {
  const addRepo = useAddRepoByUrl();
  const formId = useId();
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
    addRepo.mutate({ hostId, url }, { onSuccess: handleClose });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      title="Add repository by URL"
      description="Pin a repository the host token can read — even if you are not a member."
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={!hostId}
            isLoading={form.formState.isSubmitting || addRepo.isPending}
          >
            Pin repository
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          void form.handleSubmit(handleSubmit)(event);
        }}
        noValidate
      >
        <Field
          label="Repository URL or owner/repo"
          hint="A web URL, a clone URL or a path such as group/sub/repo."
          error={form.formState.errors.url?.message}
        >
          <Input
            {...form.register("url")}
            isMono
            autoComplete="off"
            placeholder="e.g. https://github.com/torvalds/linux"
          />
        </Field>
      </form>
    </Dialog>
  );
};
