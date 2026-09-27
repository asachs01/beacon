import { useState, useMemo } from 'react';
import { isSameDay, startOfDay, addDays } from 'date-fns';
import { CalendarEvent, WeatherData } from '../types';
import { eventOccursOnDay } from '../utils/event-dates';
import { Chore, ChoreCompletion, FamilyMember } from '../types/family';
import { useFamilyEvents } from '../hooks/useFamilyEvents';
import { useMealPlans } from '../hooks/useMealPlans';
import { useClock, byDay } from '../hooks/useClock';
import { ClockWeatherCard } from './cards/ClockWeatherCard';
import { FamilyCalendarCard } from './cards/FamilyCalendarCard';
import { AgendaTodayCard } from './cards/AgendaTodayCard';
import { AgendaWeekCard } from './cards/AgendaWeekCard';
import { MenuCard } from './cards/MenuCard';
import { TasksCard } from './cards/TasksCard';
import { LazyBoundary } from './LazyBoundary';
import { AdvancedDashboard } from './lazy-advanced-dashboard';
import type { TaskmateUser } from '../types/taskmate';
import { DashboardCardContext, TodoItem } from '../types/dashboard-cards';

export type { TodoItem } from '../types/dashboard-cards';

interface DashboardViewProps {
  events: CalendarEvent[];
  weather: WeatherData | null;
  chores: Chore[];
  /** Completions that count for each chore's current round, everyone's. */
  choreCompletions: ChoreCompletion[];
  onToggleChore: (choreId: string, memberId: string) => void;
  todoItems?: TodoItem[];
  onToggleTodo?: (uid: string, currentStatus: string, listId?: string) => void;
  onWeatherClick?: () => void;
  onEventClick?: (event: CalendarEvent) => void;
  members?: FamilyMember[];
  taskmateUsers?: TaskmateUser[];
  layout?: 'default' | 'classic' | 'compact';
  advancedDashboard?: boolean;
  timeFormat: '12h' | '24h';
  showSeconds?: boolean;
  selectedDate: Date;
  onSelectedDateChange: (date: Date) => void;
  /** HA to-do list for shopping cards that don't pick their own. */
  defaultShoppingList?: string;
}

export function DashboardView({
  events,
  weather,
  chores,
  choreCompletions,
  onToggleChore,
  todoItems = [],
  onToggleTodo,
  onWeatherClick,
  onEventClick,
  members = [],
  taskmateUsers = [],
  layout = 'default',
  advancedDashboard = false,
  timeFormat,
  showSeconds = false,
  selectedDate,
  onSelectedDateChange,
  defaultShoppingList = '',
}: DashboardViewProps) {
  // Re-renders the dashboard at midnight only; the clock card keeps its own time.
  const today = useClock(byDay);
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string | null>(null);

  const toggleMemberFilter = (memberId: string) => {
    setSelectedMemberFilter((prev) => (prev === memberId ? null : memberId));
  };

  const goToPreviousDay = () => onSelectedDateChange(addDays(selectedDate, -1));
  const goToNextDay = () => onSelectedDateChange(addDays(selectedDate, 1));
  const goToToday = () => onSelectedDateChange(startOfDay(new Date()));
  const isViewingToday = isSameDay(selectedDate, today);

  const filteredChores = selectedMemberFilter
    ? chores.filter((c) => c.assigned_to.includes(selectedMemberFilter))
    : chores;

  const { byMember, other } = useFamilyEvents(events, members, selectedDate);
  const { todaysMenu } = useMealPlans();

  // Events for the currently selected day, used by the "other" / fallback view
  const todayEvents = useMemo(() => {
    return events
      .filter((e) => eventOccursOnDay(e, selectedDate))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [events, selectedDate]);

  // Group the next 7 days of events for the Classic "This Week" column
  // (starts tomorrow — today is covered by the Today column)
  const weekEvents = useMemo(() => {
    const start = addDays(startOfDay(today), 1);
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      const dayEvents = events
        .filter((e) => eventOccursOnDay(e, day))
        .sort((a, b) => a.start.localeCompare(b.start));
      return { day, events: dayEvents };
    });
  }, [events, today]);

  const context: DashboardCardContext = {
    defaultShoppingList,
    timeFormat,
    showSeconds,
    events,
    weather,
    onWeatherClick,
    onEventClick,
    members,
    selectedMemberFilter,
    toggleMemberFilter,
    byMember,
    other,
    selectedDate,
    isViewingToday,
    goToPreviousDay,
    goToNextDay,
    goToToday,
    todayEvents,
    weekEvents,
    todaysMenu,
    todoItems,
    onToggleTodo,
    taskmateUsers,
    filteredChores,
    choreCompletions,
    onToggleChore,
  };

  // The legacy composition deliberately bypasses cards, GridStack, persisted
  // widget layouts, and edit mode. This preserves the pre-modular dashboard
  // until Advanced Dashboard is explicitly enabled in Appearance settings.
  if (!advancedDashboard) {
    if (layout === 'classic') {
      return (
        <div className="dashboard dashboard--classic">
          <ClockWeatherCard config={{}} context={context} />
          <main className="dash-classic">
            <AgendaTodayCard config={{}} context={context} />
            <AgendaWeekCard config={{}} context={context} />
            <aside className="dash-classic-col dash-classic-sidebar">
              <MenuCard config={{}} context={context} />
              <TasksCard config={{}} context={context} />
            </aside>
          </main>
        </div>
      );
    }

    return (
      <div className={`dashboard dashboard--${layout}`}>
        <ClockWeatherCard config={{}} context={context} />
        <main className="dash-main">
          <FamilyCalendarCard config={{}} context={context} />
        </main>
        <aside className="dash-sidebar">
          <MenuCard config={{}} context={context} />
          <TasksCard config={{}} context={context} />
        </aside>
      </div>
    );
  }

  return (
    <LazyBoundary>
      <AdvancedDashboard layout={layout} context={context} />
    </LazyBoundary>
  );
}
