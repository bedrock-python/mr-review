import { ExternalLink } from "lucide-react";

import { ColorPicker } from "@entities/host";
import type { HostColorId } from "@entities/host";
import { Field, ICON_SIZE } from "@shared/ui";

import { controlHeightStyle } from "../styles";

import type { TokenLink } from "../../lib/tokenLink";

const linkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-1)",
  fontSize: "var(--fs-meta)",
  fontWeight: "var(--fw-medium)",
  color: "var(--accent-fg)",
};

/** "Create a token on gitlab.example.com ↗": where the host issues the token this form asks for. */
export const TokenLinkAnchor = ({ link }: { link: TokenLink | null }): React.ReactElement | null =>
  link ? (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className="no-underline hover:underline"
      style={linkStyle}
    >
      {link.label}
      <ExternalLink size={ICON_SIZE.inline} aria-hidden="true" />
    </a>
  ) : null;

type ColourFieldProps = {
  value: HostColorId;
  onChange: (colorId: HostColorId) => void;
};

/** The host's identity colour, used for its icon here and in the hosts rail. */
export const ColourField = ({ value, onChange }: ColourFieldProps): React.ReactElement => (
  <Field label="Colour" isGroup>
    <div style={controlHeightStyle}>
      <ColorPicker value={value} onChange={onChange} />
    </div>
  </Field>
);
