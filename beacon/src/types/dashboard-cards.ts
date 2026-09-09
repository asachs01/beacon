import type { ComponentType } from 'react';
import { CalendarEvent, WeatherData } from '../types';
import { Chore, FamilyMember } from './family';
import { DayMenu } from './meals';
import type { TaskmateUser } from './taskmate';

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
  todayEvents: CalendarEvent[];
  weekEvents: { day: Date; events: CalendarEvent[] }[];
  todaysMenu: DayMenu;
  todoItems: TodoItem[];
  onToggleTodo?: (uid: string, currentStatus: string, listId?: string) => void;
  taskmateUsers: TaskmateUser[];
  filteredChores: Chore[];
  completedChoreIds: Set<string>;
  onToggleChore: (choreId: string) => void;
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
    label: string;
  }
  | {
    type: 'entity';
    key: string;
    label: string;
  }
  | {
    type: 'entity-list';
    key: string;
    label: string;
    /** Previous single-entity key to migrate into this list when configured. */
    legacyKey?: string;
  }
  | {
    type: 'toggle';
    key: string;
    label: string;
    description?: string;
  };

export interface CardDefinition {
  type: string;
  displayName: string;
  icon: string;
  component: DashboardCardComponent;
  defaultConfig: Record<string, unknown>;
  defaultSize: CardSize;
  /** Declarative fields rendered by the shared card configuration modal. */
  configFields?: CardConfigField[];
  /** Regions this card type can be placed/added into via the card picker. */
  allowedRegions: DashboardRegion[];
}
