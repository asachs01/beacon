import { useMemo } from 'react';
import { parseISO, isSameDay, startOfDay } from 'date-fns';
import { CalendarEvent } from '../types';
import { FamilyMember } from '../types/family';

export interface FamilyEventsMap {
  /** Events keyed by member ID */
  byMember: Map<string, CalendarEvent[]>;
  /** Events with no matching family member */
  other: CalendarEvent[];
}

/**
 * Groups today's calendar events by family member using their
 * calendar_entity field. Unmatched events go into `other`.
 */
export function useFamilyEvents(
  events: CalendarEvent[],
  members: FamilyMember[],
): FamilyEventsMap {
  return useMemo(() => {
    const today = startOfDay(new Date());
    const todayEvents = events.filter((e) =>
      isSameDay(startOfDay(parseISO(e.start)), today),
    );

    // Build a calendarId → memberId lookup
    const calToMember = new Map<string, string>();
    for (const m of members) {
      if (m.calendar_entity) {
        calToMember.set(m.calendar_entity, m.id);
      }
    }

    const byMember = new Map<string, CalendarEvent[]>();
    for (const m of members) {
      byMember.set(m.id, []);
    }

    const other: CalendarEvent[] = [];

    for (const event of todayEvents) {
      const memberId = calToMember.get(event.calendarId);
      if (memberId && byMember.has(memberId)) {
        byMember.get(memberId)!.push(event);
      } else {
        other.push(event);
      }
    }

    // Sort each member's events by start time
    for (const evts of byMember.values()) {
      evts.sort((a, b) => a.start.localeCompare(b.start));
    }
    other.sort((a, b) => a.start.localeCompare(b.start));

    return { byMember, other };
  }, [events, members]);
}
