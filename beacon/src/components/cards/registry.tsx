import { CardDefinition } from '../../types/dashboard-cards';
import { ClockWeatherCard } from './ClockWeatherCard';
import { FamilyCalendarCard } from './FamilyCalendarCard';
import { AgendaTodayCard } from './AgendaTodayCard';
import { AgendaWeekCard } from './AgendaWeekCard';
import { MenuCard } from './MenuCard';
import { TasksCard } from './TasksCard';
import { ShoppingCard } from './ShoppingCard';
import { HaEntityCard } from './HaEntityCard';
import { HaEntitiesListCard } from './HaEntitiesListCard';
import { HaToggleCard } from './HaToggleCard';

export const cardRegistry: Record<string, CardDefinition> = {
  'clock-weather': {
    type: 'clock-weather',
    displayNameKey: 'cards.clockWeather.displayName',
    icon: '🕐',
    component: ClockWeatherCard,
    defaultConfig: {},
    defaultSize: 'lg',
    allowedRegions: ['topbar', 'main', 'sidebar'],
  },
  'family-calendar': {
    type: 'family-calendar',
    displayNameKey: 'cards.familyCalendar.displayName',
    icon: '📅',
    component: FamilyCalendarCard,
    defaultConfig: { show_other: true },
    defaultSize: 'lg',
    configFields: [
      {
        type: 'toggle',
        key: 'show_other',
        labelKey: 'cards.familyCalendar.showOtherLabel',
        descriptionKey: 'cards.familyCalendar.showOtherDescription',
      },
    ],
    allowedRegions: ['main'],
  },
  'agenda-today': {
    type: 'agenda-today',
    displayNameKey: 'cards.agendaToday.displayName',
    icon: '📋',
    component: AgendaTodayCard,
    defaultConfig: {},
    defaultSize: 'md',
    allowedRegions: ['main'],
  },
  'agenda-week': {
    type: 'agenda-week',
    displayNameKey: 'cards.agendaWeek.displayName',
    icon: '🗓️',
    component: AgendaWeekCard,
    defaultConfig: {},
    defaultSize: 'md',
    allowedRegions: ['main'],
  },
  menu: {
    type: 'menu',
    displayNameKey: 'cards.menu.displayName',
    icon: '🍽️',
    component: MenuCard,
    defaultConfig: {},
    defaultSize: 'sm',
    allowedRegions: ['sidebar'],
  },
  tasks: {
    type: 'tasks',
    displayNameKey: 'cards.tasks.displayName',
    icon: '✅',
    component: TasksCard,
    defaultConfig: {},
    defaultSize: 'sm',
    allowedRegions: ['sidebar'],
  },
  shopping: {
    type: 'shopping',
    displayNameKey: 'cards.shopping.displayName',
    icon: '🛒',
    component: ShoppingCard,
    defaultConfig: { shoppingEntity: '' },
    defaultSize: 'sm',
    configFields: [
      { type: 'entity', key: 'shoppingEntity', labelKey: 'cards.shopping.entityLabel' },
    ],
    allowedRegions: ['sidebar'],
  },
  'ha-entity': {
    type: 'ha-entity',
    displayNameKey: 'cards.haEntity.displayName',
    icon: '📟',
    component: HaEntityCard,
    defaultConfig: { entity_id: '', title: '', subtitle: '' },
    defaultSize: 'sm',
    configFields: [
      { type: 'entity', key: 'entity_id', labelKey: 'cards.common.entityLabel' },
      { type: 'text', key: 'title', labelKey: 'cards.common.titleLabel' },
      { type: 'text', key: 'subtitle', labelKey: 'cards.common.subtitleLabel' },
    ],
    allowedRegions: ['topbar', 'sidebar', 'main'],
  },
  'ha-entities-list': {
    type: 'ha-entities-list',
    displayNameKey: 'cards.haEntitiesList.displayName',
    icon: '📶',
    component: HaEntitiesListCard,
    defaultConfig: { title: '', subtitle: '', entity_ids: [] },
    defaultSize: 'sm',
    configFields: [
      { type: 'text', key: 'title', labelKey: 'cards.common.titleLabel', placeholderKey: 'cardConfig.entitiesPlaceholder' },
      { type: 'text', key: 'subtitle', labelKey: 'cards.common.subtitleLabel' },
      { type: 'entity-list', key: 'entity_ids', labelKey: 'cards.common.entitiesLabel' },
    ],
    allowedRegions: ['topbar', 'sidebar', 'main'],
  },
  'ha-toggle': {
    type: 'ha-toggle',
    displayNameKey: 'cards.haToggle.displayName',
    icon: '💡',
    component: HaToggleCard,
    defaultConfig: { entity_ids: [], title: '', subtitle: '' },
    defaultSize: 'sm',
    configFields: [
      { type: 'entity-list', key: 'entity_ids', labelKey: 'cards.common.entitiesLabel', legacyKey: 'entity_id' },
      { type: 'text', key: 'title', labelKey: 'cards.common.titleLabel' },
      { type: 'text', key: 'subtitle', labelKey: 'cards.common.subtitleLabel' },
    ],
    allowedRegions: ['topbar', 'sidebar', 'main'],
  },
};

export function getCardDefinition(type: string): CardDefinition | undefined {
  return cardRegistry[type];
}
