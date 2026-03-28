import { CalendarInfo } from '../types';

interface FamilyFilterProps {
  calendars: CalendarInfo[];
  hiddenCalendars: Set<string>;
  onToggle: (calendarId: string) => void;
}

export function FamilyFilter({ calendars, hiddenCalendars, onToggle }: FamilyFilterProps) {
  if (calendars.length === 0) return null;

  return (
    <div className="family-filter">
      {calendars.map((cal) => {
        const isHidden = hiddenCalendars.has(cal.id);
        return (
          <button
            key={cal.id}
            className={`filter-pill ${isHidden ? 'filter-pill--hidden' : 'filter-pill--active'}`}
            onClick={() => onToggle(cal.id)}
            type="button"
          >
            <span
              className="filter-dot"
              style={{
                backgroundColor: isHidden ? '#d1d5db' : cal.color,
              }}
            />
            <span className="filter-name">{cal.name}</span>
          </button>
        );
      })}
    </div>
  );
}
