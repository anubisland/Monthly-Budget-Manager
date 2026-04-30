import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNRestart from 'react-native-restart';
import i18n, { LANGUAGE_KEY, AppLanguage, initI18n } from './i18n';

interface LanguageContextValue {
  language: AppLanguage;
  isRTL: boolean;
  isLoading: boolean;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  isRTL: false,
  isLoading: true,
  toggleLanguage: () => {},
});

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>('en');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY).then((stored) => {
      const lang: AppLanguage = stored === 'ar' ? 'ar' : 'en';
      initI18n(lang);
      setLanguage(lang);
      setIsLoading(false);
    });
  }, []);

  const toggleLanguage = useCallback(async () => {
    const next: AppLanguage = language === 'en' ? 'ar' : 'en';
    await AsyncStorage.setItem(LANGUAGE_KEY, next);
    await i18n.changeLanguage(next);
    setLanguage(next);

    // RTL requires a restart so the native layout engine picks up the new direction.
    // I18nManager.allowRTL must be set before the restart fires.
    const needsRTL = next === 'ar';
    if (I18nManager.isRTL !== needsRTL) {
      I18nManager.allowRTL(needsRTL);
      I18nManager.forceRTL(needsRTL);
      RNRestart.restart();
    }
  }, [language]);

  return (
    <LanguageContext.Provider
      value={{
        language,
        isRTL: language === 'ar',
        isLoading,
        toggleLanguage,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
