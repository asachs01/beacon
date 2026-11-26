import type { ComponentType } from 'react';
import { CalendarEvent, WeatherData } from '../types';
import { Chore, FamilyMember } from './family';
import { BeaconRecipe, DayMenu, MealPlanEntry, MealType } from './meals';
import type { TaskmateUser } from './taskmate';
import type { TranslationKey } from '../i18n/translations/en';
import type { HomeSensorPick } from '../home-sensors/types';

export interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
  userId?: string;
  listId?: string;
}

export type CardSize = 'sm' | 'md' | 'lg';

export type DashboardRegion = 'topbar' | 'main' | 'sidebar';

/** Grid position/size in the main region's GridStack grid (12 columns). */
export interface GridPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A single card placed in a dashboard region. */
export interface DashboardCard {
  id: string;
  type: string;
  /** Used by list regions (sidebar/topbar) for min-height sizing. */
  size: CardSize;
  /** Used by the main region's GridStack grid. Absent for list-region cards. */
  layout?: GridPosition;
  config: Record<string, unknown>;
}

/** Cards grouped by the dashboard region they render in. */
export interface DashboardRegionLayout {
  topbar: DashboardCard[];
  main: DashboardCard[];
  sidebar: DashboardCard[];
}

/** A single named dashboard "view" (tab), like a Lovelace dashboard view. */
export interface DashboardLayoutView {
  id: string;
  name: string;
  regions: DashboardRegionLayout;
}

/**
 * Shared data every card can read from. Built once per DashboardView render
 * so individual cards stay "dumb" (Phase 1); self-fetching HA entity cards
 * (Phase 3) will mostly ignore this and rely on `config` instead.
 */
export interface DashboardCardContext {
  now: Date;
  timeFormat: '12h' | '24h';
  events: CalendarEvent[];
  weather: WeatherData | null;
  onWeatherClick?: () => void;
  onEventClick?: (event: CalendarEvent) => void;
  members: FamilyMember[];
  selectedMemberFilter: string | null;
  toggleMemberFilter: (memberId: string) => void;
  byMember: Map<string, CalendarEvent[]>;
  other: CalendarEvent[];
  /** Day currently browsed via the topbar's day navigation (defaults to today). */
  selectedDate: Date;
  isViewingToday: boolean;
  goToPreviousDay: () => void;
  goToNextDay: () => void;
  goToToday: () => void;
  /**
   * True while the selected day's events are not in the loaded window yet.
   * Empty states must show a loading message instead of "nothing scheduled".
   */
  eventsLoading?: boolean;
  /** False while that day's window is still being fetched. */
  isDayLoaded?: (day: Date) => boolean;
  todayEvents: CalendarEvent[];
  weekEvents: { day: Date; events: CalendarEvent[] }[];
  todaysMenu: DayMenu;
  /** Present when the dashboard can edit today's meals. */
  mealPlan?: {
    recipes: BeaconRecipe[];
    upsertMeal: (entry: MealPlanEntry) => Promise<void>;
    deleteMeal: (target: { date: string; meal_type: MealType; id?: string }) => Promise<void>;
    saveRecipe: (input: { id?: string; name: string; ingredients: string[] }) => Promise<BeaconRecipe>;
    addIngredients: (ingredients: string[]) => Promise<void>;
  };
  onPlanMeals?: () => void;
  todoItems: TodoItem[];
  onToggleTodo?: (uid: string, currentStatus: string, listId?: string) => void;
  taskmateUsers: TaskmateUser[];
  filteredChores: Chore[];
  completedChoreIds: Set<string>;
  onToggleChore: (choreId: string) => void;
  /** Chore ids checked off by a guest. Omitted when none of today's completions were. */
  guestCheckedChoreIds?: ReadonlySet<string>;
  /** True while guest mode is on. The home sensors card hides itself. */
  guestActive: boolean;
  /** Kid Display never mounts this dashboard, and the card stays hidden if it did. */
  kidDisplay: boolean;
  /** Settings → Integrations. Off until a parent enables the card. */
  homeSensorsEnabled: boolean;
  homeSensors: HomeSensorPick[];
}

export interface DashboardCardProps {
  config: Record<string, unknown>;
  context: DashboardCardContext;
}

export type DashboardCardComponent = ComponentType<DashboardCardProps>;

export type CardConfigField =
  | {
    type: 'text';
    key: string;
    labelKey: TranslationKey;
  }
  | {
    type: 'entity';
    key: string;
    labelKey: TranslationKey;
  }
  | {
    type: 'entity-list';
    key: string;
    labelKey: TranslationKey;
    /** Previous single-entity key to migrate into this list when configured. */
    legacyKey?: string;
  }
  | {
    type: 'toggle';
    key: string;
    labelKey: TranslationKey;
    descriptionKey?: TranslationKey;
  };

export interface CardDefinition {
  type: string;
  displayNameKey: TranslationKey;
  icon: string;
  component: DashboardCardComponent;
  defaultConfig: Record<string, unknown>;
  defaultSize: CardSize;
  /** Declarative fields rendered by the shared card configuration modal. */
  configFields?: CardConfigField[];
  /** Regions this card type can be placed/added into via the card picker. */
  allowedRegions: DashboardRegion[];
}
