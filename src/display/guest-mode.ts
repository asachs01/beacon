/**
 * Guest mode limits what this Beacon screen shows. It is not a security
 * boundary: Home Assistant and Beacon stay reachable on the network.
 *
 * Family PIN checks (`pinMatches`, `configuredMemberPins`, `importPinDecision`)
 * never receive the guest PIN. Entering and leaving guest mode is decided
 * here, beside those checks, and a guest PIN cannot grant them.
 *
 * Future features opt in through `registerGuestFeature`. Anything that shows
 * where the family is uses `kind: 'whereabouts'` and is hidden from guests
 * unless `allowGuests` is set:
 *
 *   registerGuestFeature({ id: 'whosHome', kind: 'whereabouts' });
 *   if (!canSee('whosHome')) return null;
 */
import { normalizePin, pinMatches } from './hidden-gesture';

export const GUEST_SESSION_KEY = 'beacon-guest-session';

export interface GuestSession {
  /** Epoch milliseconds. Null stays on until a family PIN leaves guest mode. */
  expiresAt: number | null;
}

/** A saved guest PIN turns the feature on only when it is 4–6 digits. */
export function guestPinConfigured(pin: string | null | undefined): boolean {
  const digits = normalizePin(pin ?? '');
  return digits.length >= 4 && digits.length <= 6;
}

export type GuestPinProblem = 'length' | 'matches-member';

/**
 * Empty is valid and leaves guest mode off. A 4–6 digit PIN that matches a
 * family PIN is rejected so the guest PIN can never unlock a family gate.
 */
export function guestPinProblem(
  pin: string,
  memberPins: readonly (string | null | undefined)[],
): GuestPinProblem | null {
  const digits = normalizePin(pin);
  if (digits.length === 0) return null;
  if (digits.length < 4 || digits.length > 6) return 'length';
  const members = memberPins
    .map((entry) => normalizePin(entry ?? ''))
    .filter((entry) => entry.length > 0);
  if (members.some((member) => member === digits)) return 'matches-member';
  return null;
}

export function readGuestSession(now = Date.now()): { active: boolean; expiresAt: number | null } {
  try {
    const raw = localStorage.getItem(GUEST_SESSION_KEY);
    if (!raw) return { active: false, expiresAt: null };
    const parsed = JSON.parse(raw) as Partial<GuestSession> | null;
    if (!parsed || typeof parsed !== 'object') {
      localStorage.removeItem(GUEST_SESSION_KEY);
      return { active: false, expiresAt: null };
    }
    const expiresAt = parsed.expiresAt == null ? null : Number(parsed.expiresAt);
    if (expiresAt != null && (!Number.isFinite(expiresAt) || now >= expiresAt)) {
      localStorage.removeItem(GUEST_SESSION_KEY);
      return { active: false, expiresAt: null };
    }
    return { active: true, expiresAt };
  } catch {
    return { active: false, expiresAt: null };
  }
}

/** `timeoutHours` null, or any non-positive value, means no timeout. */
export function startGuestSession(timeoutHours: number | null, now = Date.now()): GuestSession {
  const expiresAt = timeoutHours != null && timeoutHours > 0
    ? now + timeoutHours * 60 * 60 * 1000
    : null;
  const session: GuestSession = { expiresAt };
  localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearGuestSession(): void {
  try {
    localStorage.removeItem(GUEST_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export type GuestFeatureKind = 'screen' | 'whereabouts';

export interface GuestFeatureRegistration {
  id: string;
  /**
   * `whereabouts` is for anything that shows where the family is. Those
   * features are hidden from guests unless `allowGuests` is true.
   * `screen` features set `allowGuests` explicitly.
   */
  kind: GuestFeatureKind;
  allowGuests?: boolean;
}

const registry = new Map<string, GuestFeatureRegistration>();

/** Register or replace one feature. Safe to call again with the same id. */
export function registerGuestFeature(feature: GuestFeatureRegistration): void {
  registry.set(feature.id, { ...feature });
}

export function guestFeatureRegistration(id: string): GuestFeatureRegistration | undefined {
  const found = registry.get(id);
  return found ? { ...found } : undefined;
}

function seedGuestFeatures(): void {
  const screen = (id: string, allowGuests: boolean) => {
    registerGuestFeature({ id, kind: 'screen', allowGuests });
  };
  screen('calendar', true);
  screen('chores', true);
  screen('tasks', true);
  screen('grocery', true);
  screen('timers', true);
  screen('settings', false);
  screen('family', false);
  screen('rewards', false);
  screen('rewardsRedeem', false);
  screen('magicImport', false);
  screen('deleteEvents', false);
  screen('kioskExit', false);
  registerGuestFeature({ id: 'presence', kind: 'whereabouts' });
  registerGuestFeature({ id: 'location', kind: 'whereabouts' });
}

seedGuestFeatures();

/** When guest mode is off, every feature is visible. Whereabouts defaults to hidden. */
export function guestCanSee(active: boolean, featureId: string): boolean {
  if (!active) return true;
  const feature = registry.get(featureId);
  if (!feature) return true;
  if (feature.kind === 'whereabouts') return feature.allowGuests === true;
  return feature.allowGuests !== false;
}

/** Guests can earn rewards by checking off chores. They cannot redeem them. */
export function rewardRedemptionAllowed(active: boolean): boolean {
  return guestCanSee(active, 'rewardsRedeem');
}

export type GesturePinOutcome = 'enter-guest' | 'exit-guest' | 'grant-family' | 'rejected';

/**
 * Classify a PIN typed into the hidden-corner dialog.
 * The guest PIN can only enter guest mode. It is never a family grant, and
 * it cannot leave guest mode or exit kiosk / Kid Display.
 */
export function classifyGesturePin(input: {
  pin: string;
  memberPins: readonly string[];
  guestPin: string;
  guestActive: boolean;
}): GesturePinOutcome {
  const entered = normalizePin(input.pin);
  const guest = normalizePin(input.guestPin);
  const guestOk = guestPinConfigured(input.guestPin) && entered.length > 0 && entered === guest;
  const familyOk = pinMatches(entered, input.memberPins);
  if (input.guestActive) {
    if (familyOk && !guestOk) return 'exit-guest';
    return 'rejected';
  }
  if (guestOk) return 'enter-guest';
  if (familyOk) return 'grant-family';
  return 'rejected';
}

export function filterEventsForGuest<T extends { calendarId: string }>(
  events: readonly T[],
  guestActive: boolean,
  hiddenCalendarIds: readonly string[],
): T[] {
  if (!guestActive || hiddenCalendarIds.length === 0) return [...events];
  const hidden = new Set(hiddenCalendarIds);
  return events.filter((event) => !hidden.has(event.calendarId));
}

export function filterCalendarsForGuest<T extends { id: string }>(
  calendars: readonly T[],
  guestActive: boolean,
  hiddenCalendarIds: readonly string[],
): T[] {
  if (!guestActive || hiddenCalendarIds.length === 0) return [...calendars];
  const hidden = new Set(hiddenCalendarIds);
  return calendars.filter((calendar) => !hidden.has(calendar.id));
}

export function completionCheckedByGuest(
  completion: { by?: string } | null | undefined,
): boolean {
  return completion?.by === 'guest';
}
