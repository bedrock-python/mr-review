/// <reference types="vite/client" />

type ImportMetaEnv = {
  readonly VITE_ENABLE_MSW_BUNDLE: string;
};

type ImportMeta = {
  readonly env: ImportMetaEnv;
};

type BaseTheme = {
  primary: string;
  secondary: string;
  accent: string;
  destructive: string;
  muted: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  border: string;
  input: string;
  ring: string;
  radius: string;
};

declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const content: string;
  export default content;
}

declare module "*.jpg" {
  const content: string;
  export default content;
}

declare module "*.jpeg" {
  const content: string;
  export default content;
}

declare module "*.webp" {
  const content: string;
  export default content;
}

declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
