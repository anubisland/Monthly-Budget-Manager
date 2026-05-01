import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ar from './locales/ar.json';

export const LANGUAGE_KEY = 'anubisland_lang';
export type AppLanguage = 'en' | 'ar';

export function initI18n(storedLang: AppLanguage = 'en') {
  i18n.use(initReactI18next).init({
    compatibilityJSON: 'v3',
    lng: storedLang,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    interpolation: { escapeValue: false },
  });
  return i18n;
}

export default i18n;
