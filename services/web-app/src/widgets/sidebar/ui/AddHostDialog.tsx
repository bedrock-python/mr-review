import { useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateHost } from "@entities/host";
import { CreateHostFormSchema, EMPTY_HOST_FORM, HostFields } from "@features/manage-hosts";
import { Button, Dialog } from "@shared/ui";
import type { HostFormValues } from "@features/manage-hosts";

export type AddHostDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * A new Git host: its kind, where it is, the token to read it with, a timeout and a colour —
 * the same fields as Settings' host form.
 */
export const AddHostDialog = ({ isOpen, onClose }: AddHostDialogProps): React.ReactElement => {
  const createHost = useCreateHost();
  const formId = useId();
  const form = useForm<HostFormValues>({
    resolver: zodResolver(CreateHostFormSchema),
    defaultValues: EMPTY_HOST_FORM,
  });

  const handleClose = (): void => {
    form.reset(EMPTY_HOST_FORM);
    onClose();
  };

  const handleSubmit = ({ colorId, ...data }: HostFormValues): void => {
    createHost.mutate({ ...data, color: colorId }, { onSuccess: handleClose });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      title="Add host"
      description="Connect a GitLab, GitHub, Gitea, Forgejo or Bitbucket instance to review its merge requests."
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            isLoading={form.formState.isSubmitting || createHost.isPending}
          >
            Add host
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
        className="flex flex-col gap-(--space-4)"
      >
        <HostFields form={form} mode="create" />
      </form>
    </Dialog>
  );
};
