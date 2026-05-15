import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";

const defaultNS = "translation";

export const resources = {
  en: {
    translation: en,
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  defaultNS,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
