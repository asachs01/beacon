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
 * unless `allowGuests` is set. Home sensors use `kind: 'sensors'`, which is
 * hidden from guests the same way:
 *
 *   registerGuestFeature({ id: 'whosHome', kind: 'whereabouts' });
 *   if (!canSee('whosHome')) return null;
 */
import { normalizePin, pinMatches } from './hidden-gesture';

export const GUEST_SESSION_KEY = 'beacon-guest-session';

export interface GuestSession {
  /** Epoch milliseconds. Null stays on until someone leaves guest mode. */
  expiresAt: number | null;
  /**
   * Hash of the guest PIN config that started this session. A reload drops
   * the session when this no longer matches the saved guest PIN.
   */
  pinConfig: string;
}

/**
 * Fingerprint of the guest PIN config. This is not the PIN. Clearing or
 * changing the PIN produces a different token, so a stored session no
 * longer matches.
 */
export function guestPinConfigToken(pin: string | null | undefined): string {
  const digits = normalizePin(pin ?? '');
  let hash = 0x811c9dc5;
  const source = `beacon-guest-pin-v1:${digits}`;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1:${(hash >>> 0).toString(16).padStart(8, '0')}`;
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

export function readGuestSession(
  pin: string | null | undefined,
  now = Date.now(),
): { active: boolean; expiresAt: number | null } {
  try {
    const raw = localStorage.getItem(GUEST_SESSION_KEY);
    if (!raw) return { active: false, expiresAt: null };
    const parsed = JSON.parse(raw) as Partial<GuestSession> | null;
    if (!parsed || typeof parsed !== 'object') {
      localStorage.removeItem(GUEST_SESSION_KEY);
      return { active: false, expiresAt: null };
    }
    // A session from before the PIN fingerprint, or one whose PIN was
    // cleared or changed, does not come back after reload.
    if (parsed.pinConfig !== guestPinConfigToken(pin)) {
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
export function startGuestSession(
  timeoutHours: number | null,
  pin: string | null | undefined,
  now = Date.now(),
): GuestSession {
  const expiresAt = timeoutHours != null && timeoutHours > 0
    ? now + timeoutHours * 60 * 60 * 1000
    : null;
  const session: GuestSession = { expiresAt, pinConfig: guestPinConfigToken(pin) };
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

export type GuestFeatureKind = 'screen' | 'whereabouts' | 'sensors';

export interface GuestFeatureRegistration {
  id: string;
  /**
   * `whereabouts` is for anything that shows where the family is. Those
   * features are hidden from guests unless `allowGuests` is true.
   * `sensors` is the home sensors card. It is hidden from guests unless
   * `allowGuests` is true. `screen` features set `allowGuests` explicitly.
   */
  kind: GuestFeatureKind;
  allowGuests?: boolean;
}

/**
 * Denylist. A feature that is not registered stays visible to guests.
 * Meals, photos, music, and the leaderboard are left unregistered on purpose.
 * `kind: 'whereabouts'` and `kind: 'sensors'` are hidden from guests unless
 * `allowGuests` is true.
 */
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
  screen('createEvents', false);
  screen('editEvents', false);
  screen('deleteEvents', false);
  screen('kioskExit', false);
  registerGuestFeature({ id: 'presence', kind: 'whereabouts' });
  registerGuestFeature({ id: 'location', kind: 'whereabouts' });
  registerGuestFeature({ id: 'homeSensors', kind: 'sensors' });
}

seedGuestFeatures();

/** When guest mode is off, every feature is visible. Whereabouts and sensors default to hidden. */
export function guestCanSee(active: boolean, featureId: string): boolean {
  if (!active) return true;
  const feature = registry.get(featureId);
  if (!feature) return true;
  if (feature.kind === 'whereabouts' || feature.kind === 'sensors') return feature.allowGuests === true;
  return feature.allowGuests !== false;
}

/** Guests can earn rewards by checking off chores. They cannot redeem them. */
export function rewardRedemptionAllowed(active: boolean): boolean {
  return guestCanSee(active, 'rewardsRedeem');
}

export type GuestEventAction = 'create' | 'edit' | 'delete';

/** Create, edit, and delete are registered denials. Guests can still view events. */
export function guestMayMutateEvent(active: boolean, action: GuestEventAction): boolean {
  const feature = action === 'create'
    ? 'createEvents'
    : action === 'edit'
      ? 'editEvents'
      : 'deleteEvents';
  return guestCanSee(active, feature);
}

/**
 * Marker stored on a chore completion. The Chores screen and the dashboard
 * and calendar checklists all pass this to `completeChore`.
 */
export function guestCompletionBy(guestActive: boolean): 'guest' | undefined {
  return guestActive ? 'guest' : undefined;
}

/**
 * True when guest mode is on and neither a family PIN nor a guest PIN is
 * configured, so the corner gesture itself leaves guest mode.
 */
export function guestExitWithoutPin(input: {
  guestActive: boolean;
  familyPinConfigured: boolean;
  guestPin: string | null | undefined;
}): boolean {
  return input.guestActive
    && !input.familyPinConfigured
    && !guestPinConfigured(input.guestPin);
}

export type GesturePinOutcome = 'enter-guest' | 'exit-guest' | 'grant-family' | 'rejected';

/**
 * Classify a PIN typed into the hidden-corner dialog.
 * The guest PIN can enter guest mode. It is never a family grant, and it
 * cannot reveal kiosk navigation or leave Kid Display.
 * While guest mode is on, a family PIN leaves it. When no family PIN is
 * set, the guest PIN leaves it instead.
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
  const familyConfigured = input.memberPins.some((pin) => normalizePin(pin).length > 0);
  if (input.guestActive) {
    if (familyConfigured) {
      if (familyOk && !guestOk) return 'exit-guest';
      return 'rejected';
    }
    if (guestOk) return 'exit-guest';
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
