import { Checkbox, CountBadge, Field } from "@shared/ui";

import { MODELS_HINT } from "../../lib/providerEndpoint";
import { controlHeightStyle } from "../styles";
import { ModelListEditor } from "./ModelListEditor";

import type { ModelListEditorProps } from "./ModelListEditor";

type SslVerifyFieldProps = Omit<React.ComponentProps<typeof Checkbox>, "label">;

/** "Verify TLS certificate", lined up with the timeout input beside it. */
export const SslVerifyField = (props: SslVerifyFieldProps): React.ReactElement => (
  <Field label="SSL verify" isGroup>
    <div style={controlHeightStyle}>
      <Checkbox {...props} label="Verify TLS certificate" />
    </div>
  </Field>
);

/** The model list editor under a "Models" label with its count. */
export const ModelsField = (props: ModelListEditorProps): React.ReactElement => (
  <Field
    isGroup
    label="Models"
    labelAside={
      props.models.length > 0 ? (
        <CountBadge
          count={props.models.length}
          label={`${String(props.models.length)} model${props.models.length === 1 ? "" : "s"}`}
        />
      ) : undefined
    }
    hint={MODELS_HINT}
  >
    <ModelListEditor {...props} />
  </Field>
);
