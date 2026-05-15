import type { resources } from "./config";

declare module "i18next" {
  type CustomTypeOptions = {
    defaultNS: "translation";
    resources: (typeof resources)["en"];
  };
}
