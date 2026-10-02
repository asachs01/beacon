import { enUS, enGB, es, fr, de, it, pt, nl, ja, ko, type Locale } from 'date-fns/locale';

export type LangCode = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'nl' | 'ja' | 'ko';

/** Maps a `BeaconSettings.locale` value (as offered in Settings > General)
 *  to the translation language it should use. en-US/en-GB share one
 *  English translation set — only their date-fns locale differs. */
const LANG_BY_LOCALE: Record<string, LangCode> = {
  'en-US': 'en',
  'en-GB': 'en',
  es: 'es',
  fr: 'fr',
  de: 'de',
  it: 'it',
  pt: 'pt',
  nl: 'nl',
  ja: 'ja',
  ko: 'ko',
};

const DATE_FNS_LOCALE_BY_LOCALE: Record<string, Locale> = {
  'en-US': enUS,
  'en-GB': enGB,
  es,
  fr,
  de,
  it,
  pt,
  nl,
  ja,
  ko,
};

export function langForLocale(locale: string): LangCode {
  return LANG_BY_LOCALE[locale] ?? 'en';
}

export function dateFnsLocaleFor(locale: string): Locale {
  return DATE_FNS_LOCALE_BY_LOCALE[locale] ?? enUS;
}
