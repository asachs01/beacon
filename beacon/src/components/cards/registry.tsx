import { CardDefinition } from '../../types/dashboard-cards';
import { ClockWeatherCard } from './ClockWeatherCard';
import { FamilyCalendarCard } from './FamilyCalendarCard';
import { AgendaTodayCard } from './AgendaTodayCard';
import { AgendaWeekCard } from './AgendaWeekCard';
import { MenuCard } from './MenuCard';
import { TasksCard } from './TasksCard';
import { HaEntityCard } from './HaEntityCard';
import { HaEntitiesListCard } from './HaEntitiesListCard';
import { HaToggleCard } from './HaToggleCard';

export const cardRegistry: Record<string, CardDefinition> = {
  'clock-weather': {
    type: 'clock-weather',
    displayName: 'Clock & Weather',
    icon: '🕐',
    component: ClockWeatherCard,
    defaultConfig: {},
    defaultSize: 'lg',
    allowedRegions: ['topbar', 'main', 'sidebar'],
  },
  'family-calendar': {
    type: 'family-calendar',
    displayName: 'Family Calendar',
    icon: '📅',
    component: FamilyCalendarCard,
    defaultConfig: { show_other: true },
    defaultSize: 'lg',
    configFields: [
      {
        type: 'toggle',
        key: 'show_other',
        label: 'Show Other',
        description: 'Display events not assigned to a family member',
      },
    ],
    allowedRegions: ['main'],
  },
  'agenda-today': {
    type: 'agenda-today',
    displayName: 'Today',
    icon: '📋',
    component: AgendaTodayCard,
    defaultConfig: {},
    defaultSize: 'md',
    allowedRegions: ['main'],
  },
  'agenda-week': {
    type: 'agenda-week',
    displayName: 'This Week',
    icon: '🗓️',
    component: AgendaWeekCard,
    defaultConfig: {},
    defaultSize: 'md',
    allowedRegions: ['main'],
  },
  menu: {
    type: 'menu',
    displayName: 'Menu',
    icon: '🍽️',
    component: MenuCard,
    defaultConfig: {},
    defaultSize: 'sm',
    allowedRegions: ['sidebar'],
  },
  tasks: {
    type: 'tasks',
    displayName: 'Tasks',
    icon: '✅',
    component: TasksCard,
    defaultConfig: {},
    defaultSize: 'sm',
    allowedRegions: ['sidebar'],
  },
  'ha-entity': {
    type: 'ha-entity',
    displayName: 'HA Entity',
    icon: '📟',
    component: HaEntityCard,
    defaultConfig: { entity_id: '', title: '', subtitle: '' },
    defaultSize: 'sm',
    configFields: [
      { type: 'entity', key: 'entity_id', label: 'Entity' },
      { type: 'text', key: 'title', label: 'Title' },
      { type: 'text', key: 'subtitle', label: 'Subtitle' },
    ],
    allowedRegions: ['topbar', 'sidebar', 'main'],
  },
  'ha-entities-list': {
    type: 'ha-entities-list',
    displayName: 'HA Entities List',
    icon: '📶',
    component: HaEntitiesListCard,
    defaultConfig: { title: 'Entities', subtitle: '', entity_ids: [] },
    defaultSize: 'sm',
    configFields: [
      { type: 'text', key: 'title', label: 'Title' },
      { type: 'text', key: 'subtitle', label: 'Subtitle' },
      { type: 'entity-list', key: 'entity_ids', label: 'Entities' },
    ],
    allowedRegions: ['topbar', 'sidebar', 'main'],
  },
  'ha-toggle': {
    type: 'ha-toggle',
    displayName: 'HA Toggle',
    icon: '💡',
    component: HaToggleCard,
    defaultConfig: { entity_ids: [], title: '', subtitle: '' },
    defaultSize: 'sm',
    configFields: [
      { type: 'entity-list', key: 'entity_ids', label: 'Entities', legacyKey: 'entity_id' },
      { type: 'text', key: 'title', label: 'Title' },
      { type: 'text', key: 'subtitle', label: 'Subtitle' },
    ],
    allowedRegions: ['topbar', 'sidebar', 'main'],
  },
};

export function getCardDefinition(type: string): CardDefinition | undefined {
  return cardRegistry[type];
}
