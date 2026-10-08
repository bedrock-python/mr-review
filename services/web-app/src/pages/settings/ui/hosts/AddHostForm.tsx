import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";

import { useCreateHost } from "@entities/host";
import { CreateHostFormSchema, EMPTY_HOST_FORM, HostFields } from "@features/manage-hosts";
import type { HostFormValues } from "@features/manage-hosts";
import { Button, ICON_SIZE } from "@shared/ui";

import { useFocusWhenClosed } from "../../lib/useFocusWhenClosed";
import { InlineForm } from "../InlineForm";
import { addRowStyle } from "../styles";

/** "Add host" at the bottom of the hosts list, opening the form in its place. */
export const AddHostForm = (): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const addButtonRef = useFocusWhenClosed<HTMLButtonElement>(isOpen);
  const createHost = useCreateHost();
  const form = useForm<HostFormValues>({
    resolver: zodResolver(CreateHostFormSchema),
    defaultValues: EMPTY_HOST_FORM,
  });

  const handleSubmit = ({ colorId, ...data }: HostFormValues): void => {
    createHost.mutate(
      { ...data, color: colorId },
      {
        onSuccess: () => {
          form.reset(EMPTY_HOST_FORM);
          setIsOpen(false);
        },
      }
    );
  };

  if (!isOpen) {
    return (
      <div style={addRowStyle}>
        <Button
          ref={addButtonRef}
          data-add-button=""
          variant="ghost"
          size="sm"
          icon={<Plus size={ICON_SIZE.inline} aria-hidden="true" />}
          onClick={() => {
            setIsOpen(true);
          }}
        >
          Add host
        </Button>
      </div>
    );
  }

  return (
    <InlineForm
      title="New host"
      submitLabel="Add host"
      isPending={createHost.isPending}
      onSubmit={(e) => {
        void form.handleSubmit(handleSubmit)(e);
      }}
      onCancel={() => {
        setIsOpen(false);
        form.reset();
      }}
    >
      <HostFields form={form} mode="create" />
    </InlineForm>
  );
};
