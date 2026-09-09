import { DashboardCardProps } from '../../types/dashboard-cards';
import { EventCard } from '../EventCard';
import { readBoolean } from './card-config';

/** Per-member calendar grid (default layout's main content). */
export function FamilyCalendarCard({ config, context }: DashboardCardProps) {
  const { members, byMember, other, todayEvents, onEventClick, selectedMemberFilter, toggleMemberFilter, isViewingToday } = context;
  const showOther = readBoolean(config, 'show_other', true);

  const hasMemberCalendars = members.some(
    (m) => m.calendar_entity || (m.additional_calendar_entities?.length ?? 0) > 0,
  );

  if (!hasMemberCalendars) {
    // Fallback: flat event list when no members have calendars assigned
    return (
      <div className="dash-events-fallback">
        <div className="dashboard-events-scroll">
          {todayEvents.length === 0 ? (
            <div className="dashboard-empty">Nothing scheduled — your day is wide open</div>
          ) : (
            <div className="dashboard-events-list">
              {todayEvents.map((event) => (
                <EventCard key={event.id} event={event} onClick={onEventClick} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dash-family-grid" style={{ '--member-count': members.length } as React.CSSProperties}>
      {members.map((member) => {
        const memberEvents = byMember.get(member.id) || [];
        const isSelected = selectedMemberFilter === member.id;
        return (
          <section key={member.id} className={`dash-member-col ${isSelected ? 'dash-member-col--selected' : ''}`}>
            <button
              type="button"
              className="dash-member-header dash-member-header--clickable"
              onClick={() => toggleMemberFilter(member.id)}
              aria-pressed={isSelected}
              aria-label={`Filter chores for ${member.name}`}
            >
              <span
                className="dash-member-avatar"
                style={{ backgroundColor: member.color + '22', borderColor: member.color }}
              >
                {member.avatar}
              </span>
              <span className="dash-member-name" style={{ color: member.color }}>
                {member.name}
              </span>
            </button>
            <div className="dash-member-events">
              {memberEvents.length === 0 ? (
                <div className="dash-member-empty">Nothing scheduled {isViewingToday ? 'today' : 'this day'}</div>
              ) : (
                memberEvents.map((event) => (
                  <EventCard key={event.id} event={event} onClick={onEventClick} />
                ))
              )}
            </div>
          </section>
        );
      })}
      {showOther && other.length > 0 && (
        <section className="dash-member-col dash-member-col--other">
          <div className="dash-member-header">
            <span className="dash-member-avatar" style={{ backgroundColor: 'var(--bg-hover)', borderColor: 'var(--border)' }}>
              📅
            </span>
            <span className="dash-member-name">Other</span>
          </div>
          <div className="dash-member-events">
            {other.map((event) => (
              <EventCard key={event.id} event={event} onClick={onEventClick} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
