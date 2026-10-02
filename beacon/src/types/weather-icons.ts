import type { TranslationKey } from '../i18n';

/** Maps HA weather conditions to translation keys */
const WEATHER_CONDITION_KEYS: Record<string, TranslationKey> = {
  'clear-night': 'weather.condition.clearNight',
  cloudy: 'weather.condition.cloudy',
  fog: 'weather.condition.fog',
  hail: 'weather.condition.hail',
  lightning: 'weather.condition.lightning',
  'lightning-rainy': 'weather.condition.lightningRainy',
  partlycloudy: 'weather.condition.partlyCloudy',
  pouring: 'weather.condition.pouring',
  rainy: 'weather.condition.rainy',
  snowy: 'weather.condition.snowy',
  'snowy-rainy': 'weather.condition.snowyRainy',
  sunny: 'weather.condition.sunny',
  windy: 'weather.condition.windy',
  'windy-variant': 'weather.condition.windyVariant',
  exceptional: 'weather.condition.exceptional',
};

/** Maps HA weather conditions to emoji icons */
const WEATHER_ICONS: Record<string, string> = {
  'clear-night': '\u{1F319}',
  cloudy: '\u2601\uFE0F',
  fog: '\u{1F32B}\uFE0F',
  hail: '\u{1F328}\uFE0F',
  lightning: '\u26A1',
  'lightning-rainy': '\u26C8\uFE0F',
  partlycloudy: '\u26C5',
  pouring: '\u{1F327}\uFE0F',
  rainy: '\u{1F326}\uFE0F',
  snowy: '\u2744\uFE0F',
  'snowy-rainy': '\u{1F328}\uFE0F',
  sunny: '\u2600\uFE0F',
  windy: '\u{1F4A8}',
  'windy-variant': '\u{1F4A8}',
  exceptional: '\u26A0\uFE0F',
};

export function weatherIcon(condition: string): string {
  return WEATHER_ICONS[condition] || '\u{1F324}\uFE0F';
}

export function conditionLabel(condition: string, t: (key: TranslationKey) => string): string {
  const key = WEATHER_CONDITION_KEYS[condition];
  if (key) return t(key);
  return condition
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
