import { describe, expect, it } from 'vitest';
import { configuredMemberPins, pinMatches, reduceHiddenGesture, initialHiddenGestureState } from './hidden-gesture';
import { importPinDecision } from '../import/pin-gate';
import {
  GUEST_SESSION_KEY,
  classifyGesturePin,
  clearGuestSession,
  completionCheckedByGuest,
  filterCalendarsForGuest,
  filterEventsForGuest,
  guestCanSee,
  guestFeatureRegistration,
  guestPinProblem,
  readGuestSession,
  registerGuestFeature,
  rewardRedemptionAllowed,
  startGuestSession,
} from './guest-mode';

const members = [{ pin: '1234' }, { pin: '5555' }, { pin: '' }];
const guestPin = '987654';

describe('guest PIN never unlocks a family gate', () => {
  it('keeps the guest PIN out of pinMatches, configuredMemberPins, and importPinDecision', () => {
    const configured = configuredMemberPins(members);
    expect(configured).toEqual(['1234', '5555']);
    expect(configured).not.toContain(guestPin);
    expect(pinMatches(guestPin, configured)).toBe(false);
    expect(pinMatches('1234', configured)).toBe(true);
    expect(importPinDecision(members, guestPin)).toBe('rejected');
    expect(importPinDecision(members, '1234')).toBe('accepted');

    const pinned = reduceHiddenGesture(
      { ...initialHiddenGestureState(), phase: 'pin', lastActivityAt: 0 },
      { type: 'submit-pin', now: 1, pin: guestPin, configuredPins: configured },
      { pinRequired: true, whenNoPin: 'grant' },
    );
    expect(pinned.phase).not.toBe('granted');
    expect(pinned.pinError).toBe(true);
  });

  it('enters guest mode with the guest PIN and does not treat that as a family grant', () => {
    const configured = configuredMemberPins(members);
    expect(classifyGesturePin({
      pin: guestPin,
      memberPins: configured,
      guestPin,
      guestActive: false,
    })).toBe('enter-guest');
    expect(classifyGesturePin({
      pin: '1234',
      memberPins: configured,
      guestPin,
      guestActive: false,
    })).toBe('grant-family');
    expect(classifyGesturePin({
      pin: guestPin,
      memberPins: configured,
      guestPin,
      guestActive: true,
    })).toBe('rejected');
    expect(classifyGesturePin({
      pin: '5555',
      memberPins: configured,
      guestPin,
      guestActive: true,
    })).toBe('exit-guest');
  });

  it('rejects a guest PIN that matches a family PIN', () => {
    expect(guestPinProblem('1234', ['12-34', ''])).toBe('matches-member');
    expect(guestPinProblem('9876', ['1234'])).toBeNull();
    expect(guestPinProblem('', ['1234'])).toBeNull();
    expect(guestPinProblem('123', ['9999'])).toBe('length');
    // PIN entry keeps the first 6 digits, so a longer value is a 6-digit PIN.
    expect(guestPinProblem('1234567', [])).toBeNull();
  });
});

describe('guest session timeout', () => {
  it('stays active until the expiry and clears itself after that', () => {
    const start = 1_700_000_000_000;
    startGuestSession(4, start);
    expect(readGuestSession(start + 60_000)).toEqual({
      active: true,
      expiresAt: start + 4 * 60 * 60 * 1000,
    });
    expect(JSON.parse(localStorage.getItem(GUEST_SESSION_KEY) ?? '{}')).toEqual({
      expiresAt: start + 4 * 60 * 60 * 1000,
    });

    expect(readGuestSession(start + 4 * 60 * 60 * 1000)).toEqual({
      active: false,
      expiresAt: null,
    });
    expect(localStorage.getItem(GUEST_SESSION_KEY)).toBeNull();
  });

  it('keeps a no-timeout session until it is cleared', () => {
    const start = 1_700_000_000_000;
    startGuestSession(null, start);
    expect(readGuestSession(start + 100 * 60 * 60 * 1000)).toEqual({
      active: true,
      expiresAt: null,
    });
    clearGuestSession();
    expect(readGuestSession(start)).toEqual({ active: false, expiresAt: null });
  });
});

describe('calendars hidden from guests', () => {
  const events = [
    { id: 'a', calendarId: 'family' },
    { id: 'b', calendarId: 'private' },
  ];
  const calendars = [
    { id: 'family', name: 'Family' },
    { id: 'private', name: 'Private' },
  ];

  it('drops flagged calendars from events and calendar lists only while guest mode is on', () => {
    expect(filterEventsForGuest(events, true, ['private'])).toEqual([events[0]]);
    expect(filterCalendarsForGuest(calendars, true, ['private'])).toEqual([calendars[0]]);
    expect(filterEventsForGuest(events, false, ['private'])).toEqual(events);
    expect(filterCalendarsForGuest(calendars, false, ['private'])).toEqual(calendars);
    expect(filterEventsForGuest(events, true, [])).toEqual(events);
  });
});

describe('guest visibility registry', () => {
  it('allows the guest screen actions and blocks the parent actions', () => {
    expect(guestCanSee(true, 'calendar')).toBe(true);
    expect(guestCanSee(true, 'chores')).toBe(true);
    expect(guestCanSee(true, 'tasks')).toBe(true);
    expect(guestCanSee(true, 'grocery')).toBe(true);
    expect(guestCanSee(true, 'timers')).toBe(true);

    expect(guestCanSee(true, 'settings')).toBe(false);
    expect(guestCanSee(true, 'family')).toBe(false);
    expect(guestCanSee(true, 'rewards')).toBe(false);
    expect(guestCanSee(true, 'rewardsRedeem')).toBe(false);
    expect(guestCanSee(true, 'magicImport')).toBe(false);
    expect(guestCanSee(true, 'deleteEvents')).toBe(false);
    expect(guestCanSee(true, 'kioskExit')).toBe(false);
    expect(rewardRedemptionAllowed(true)).toBe(false);
    expect(rewardRedemptionAllowed(false)).toBe(true);
  });

  it('hides whereabouts features from guests unless a registration allows them', () => {
    expect(guestFeatureRegistration('presence')?.kind).toBe('whereabouts');
    expect(guestFeatureRegistration('location')?.kind).toBe('whereabouts');
    expect(guestCanSee(true, 'presence')).toBe(false);
    expect(guestCanSee(true, 'location')).toBe(false);
    expect(guestCanSee(false, 'presence')).toBe(true);
    expect(guestCanSee(false, 'location')).toBe(true);

    registerGuestFeature({ id: 'whosHome', kind: 'whereabouts' });
    expect(guestCanSee(true, 'whosHome')).toBe(false);
    registerGuestFeature({ id: 'whosHome', kind: 'whereabouts', allowGuests: true });
    expect(guestCanSee(true, 'whosHome')).toBe(true);
  });
});

describe('guest completion marker', () => {
  it('is true only for the optional guest actor', () => {
    expect(completionCheckedByGuest({ by: 'guest' })).toBe(true);
    expect(completionCheckedByGuest({})).toBe(false);
    expect(completionCheckedByGuest(undefined)).toBe(false);
  });
});
