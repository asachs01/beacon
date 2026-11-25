/**
 * Hidden parent gesture shared by kiosk mode and Kid Display.
 *
 * A long-press (~2s) or 3 quick taps in the top-corner hot zone, or a
 * long-press of Escape, asks to reveal navigation or leave Kid Display.
 * Kids are unlikely to hold a corner still or triple-tap it on purpose.
 */

export const HIDDEN_GESTURE_LONG_PRESS_MS = 2000;
export const HIDDEN_GESTURE_TAP_COUNT = 3;
/** Maximum gap between taps that still counts as one quick sequence. */
export const HIDDEN_GESTURE_TAP_GAP_MS = 600;
/** A press longer than this is not a tap. The long-press fires at 2 seconds. */
export const HIDDEN_GESTURE_TAP_MAX_MS = 500;
/** Navigation (or an open PIN/confirm dialog) hides after this much inactivity. */
export const HIDDEN_GESTURE_IDLE_MS = 15_000;
export const HIDDEN_GESTURE_HOT_ZONE_PX = 64;
/** Finger travel past this cancels the in-progress press so swipes do not count. */
export const HIDDEN_GESTURE_MOVE_CANCEL_PX = 40;

export type HiddenGesturePhase = 'idle' | 'pin' | 'confirm' | 'granted';

export interface HiddenGestureState {
  phase: HiddenGesturePhase;
  taps: number[];
  pressStartedAt: number | null;
  lastActivityAt: number | null;
  pinError: boolean;
}

export interface HiddenGestureOptions {
  /** At least one family member has a PIN configured. */
  pinRequired: boolean;
  /**
   * What a successful gesture does when no PIN is set.
   * Kiosk reveals navigation immediately. Kid Display asks for a confirm.
   */
  whenNoPin: 'grant' | 'confirm';
}

export type HiddenGestureEvent =
  | { type: 'press-start'; now: number }
  | { type: 'press-cancel' }
  | { type: 'press-hold-elapsed'; now: number }
  | { type: 'press-end'; now: number; inside: boolean }
  | { type: 'request'; now: number }
  | { type: 'submit-pin'; now: number; pin: string; configuredPins: readonly string[] }
  | { type: 'confirm'; now: number }
  | { type: 'cancel' }
  | { type: 'activity'; now: number }
  | { type: 'idle-elapsed'; now: number };

export function initialHiddenGestureState(): HiddenGestureState {
  return {
    phase: 'idle',
    taps: [],
    pressStartedAt: null,
    lastActivityAt: null,
    pinError: false,
  };
}

/** Digits only, capped at the 6-digit family PIN length. */
export function normalizePin(pin: string): string {
  return pin.replace(/\D/g, '').slice(0, 6);
}

/**
 * True when the entered PIN matches any configured family PIN.
 * Do not pass the guest PIN here. Guest mode is a separate check, and the
 * guest PIN must not satisfy a family gate.
 */
export function pinMatches(pin: string, configuredPins: readonly string[]): boolean {
  const entered = normalizePin(pin);
  return entered.length > 0 && configuredPins.some((configured) => normalizePin(configured) === entered);
}

export function configuredMemberPins(members: readonly { pin?: string | null }[]): string[] {
  const pins: string[] = [];
  for (const member of members) {
    const pin = normalizePin(member.pin ?? '');
    if (pin.length > 0) pins.push(pin);
  }
  return pins;
}

export type KioskHotCorner = 'left' | 'right';

/** Top corner on the same side as the sidebar. Bottom nav uses the top-left. */
export function kioskHotCorner(sidebarPosition: 'left' | 'right' | 'bottom'): KioskHotCorner {
  return sidebarPosition === 'right' ? 'right' : 'left';
}

/**
 * Kiosk mode hides navigation until the gesture has been granted.
 * The reveal gesture defaults on; turning it off leaves kiosk fully locked.
 */
export function kioskNavVisible(
  kioskMode: boolean,
  revealGesture: boolean,
  revealed: boolean,
): boolean {
  if (!kioskMode) return true;
  if (!revealGesture) return false;
  return revealed;
}

export function shouldOfferKioskGesture(kioskMode: boolean, revealGesture: boolean): boolean {
  return kioskMode && revealGesture;
}

function succeed(now: number, options: HiddenGestureOptions): HiddenGestureState {
  if (options.pinRequired) {
    return {
      phase: 'pin',
      taps: [],
      pressStartedAt: null,
      lastActivityAt: now,
      pinError: false,
    };
  }
  if (options.whenNoPin === 'confirm') {
    return {
      phase: 'confirm',
      taps: [],
      pressStartedAt: null,
      lastActivityAt: now,
      pinError: false,
    };
  }
  return {
    phase: 'granted',
    taps: [],
    pressStartedAt: null,
    lastActivityAt: now,
    pinError: false,
  };
}

export function reduceHiddenGesture(
  state: HiddenGestureState,
  event: HiddenGestureEvent,
  options: HiddenGestureOptions,
): HiddenGestureState {
  switch (event.type) {
    case 'press-start': {
      if (state.phase !== 'idle') return state;
      return { ...state, pressStartedAt: event.now };
    }
    case 'press-cancel': {
      if (state.pressStartedAt == null) return state;
      return { ...state, pressStartedAt: null };
    }
    case 'press-hold-elapsed': {
      if (state.phase !== 'idle' || state.pressStartedAt == null) return state;
      if (event.now - state.pressStartedAt < HIDDEN_GESTURE_LONG_PRESS_MS) return state;
      return succeed(event.now, options);
    }
    case 'press-end': {
      if (state.phase !== 'idle') return { ...state, pressStartedAt: null };
      const started = state.pressStartedAt;
      if (started == null) return state;
      if (!event.inside) {
        return { ...state, pressStartedAt: null, taps: [] };
      }
      const duration = event.now - started;
      if (duration >= HIDDEN_GESTURE_LONG_PRESS_MS) return succeed(event.now, options);
      if (duration > HIDDEN_GESTURE_TAP_MAX_MS) {
        return { ...state, pressStartedAt: null, taps: [] };
      }
      const last = state.taps[state.taps.length - 1];
      const taps = last == null || event.now - last <= HIDDEN_GESTURE_TAP_GAP_MS
        ? [...state.taps, event.now]
        : [event.now];
      if (taps.length >= HIDDEN_GESTURE_TAP_COUNT) return succeed(event.now, options);
      return { ...state, pressStartedAt: null, taps };
    }
    case 'request': {
      if (state.phase !== 'idle') return state;
      return succeed(event.now, options);
    }
    case 'submit-pin': {
      if (state.phase !== 'pin') return state;
      const ok = pinMatches(event.pin, event.configuredPins);
      if (!ok) return { ...state, pinError: true, lastActivityAt: event.now };
      return {
        phase: 'granted',
        taps: [],
        pressStartedAt: null,
        lastActivityAt: event.now,
        pinError: false,
      };
    }
    case 'confirm': {
      if (state.phase !== 'confirm') return state;
      return {
        phase: 'granted',
        taps: [],
        pressStartedAt: null,
        lastActivityAt: event.now,
        pinError: false,
      };
    }
    case 'cancel': {
      if (state.phase !== 'pin' && state.phase !== 'confirm') return state;
      return initialHiddenGestureState();
    }
    case 'activity': {
      if (state.phase === 'idle') return state;
      return { ...state, lastActivityAt: event.now };
    }
    case 'idle-elapsed': {
      if (state.phase === 'idle' || state.lastActivityAt == null) return state;
      if (event.now - state.lastActivityAt < HIDDEN_GESTURE_IDLE_MS) return state;
      return initialHiddenGestureState();
    }
    default:
      return state;
  }
}
