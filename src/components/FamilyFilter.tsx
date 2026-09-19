import { CalendarInfo } from '../types';

interface FamilyFilterProps {
  calendars: CalendarInfo[];
  hiddenCalendars: Set<string>;
  onToggle: (calendarId: string) => void;
}

export function FamilyFilter({ calendars, hiddenCalendars, onToggle }: FamilyFilterProps) {
  const visibleCalendars = calendars.filter((cal) => !hiddenCalendars.has(cal.id));
  
  if (visibleCalendars.length === 0) return null;

  return (
    <div className="family-filter">
      {visibleCalendars.map((cal) => (
        <button
          key={cal.id}
          className="filter-pill filter-pill--active"
          onClick={() => onToggle(cal.id)}
          type="button"
        >
          <span
            className="filter-dot"
            style={{ backgroundColor: cal.color }}
          />
          <span className="filter-name">{cal.name}</span>
        </button>
      ))}
    </div>
  );
}
