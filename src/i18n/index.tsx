import { createContext, useContext } from 'react';
import type { Locale } from 'date-fns/locale';
import { en, type TranslationKey } from './translations/en';
import { es } from './translations/es';
import { fr } from './translations/fr';
import { de } from './translations/de';
import { it } from './translations/it';
import { pt } from './translations/pt';
import { nl } from './translations/nl';
import { ja } from './translations/ja';
import { ko } from './translations/ko';
import { langForLocale, dateFnsLocaleFor, type LangCode } from './locales';

export type { TranslationKey } from './translations/en';
export type { LangCode } from './locales';

const DICTIONARIES: Record<LangCode, Record<TranslationKey, string>> = {
  en,
  es,
  fr,
  de,
  it,
  pt,
  nl,
  ja,
  ko,
};

export interface I18nValue {
  lang: LangCode;
  dateLocale: Locale;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** Builds a translator + date-fns locale for a `BeaconSettings.locale` value. */
export function createI18n(locale: string): I18nValue {
  const lang = langForLocale(locale);
  const dictionary = DICTIONARIES[lang];
  return {
    lang,
    dateLocale: dateFnsLocaleFor(locale),
    t: (key, vars) => interpolate(dictionary[key] ?? en[key], vars),
  };
}

const DEFAULT_I18N = createI18n('en-US');

export const I18nContext = createContext<I18nValue>(DEFAULT_I18N);

/** Reads the current translator/date-fns locale, set by `<I18nContext.Provider>` in App. */
export function useTranslation(): I18nValue {
  return useContext(I18nContext);
}
