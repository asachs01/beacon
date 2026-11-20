import { describe, it, expect } from 'vitest';
import {
  HIDDEN_GESTURE_IDLE_MS,
  HIDDEN_GESTURE_LONG_PRESS_MS,
  HIDDEN_GESTURE_TAP_GAP_MS,
  HIDDEN_GESTURE_TAP_MAX_MS,
  configuredMemberPins,
  initialHiddenGestureState,
  kioskHotCorner,
  kioskNavVisible,
  normalizePin,
  reduceHiddenGesture,
  shouldOfferKioskGesture,
  type HiddenGestureOptions,
  type HiddenGestureState,
} from './hidden-gesture';

const kiosk: HiddenGestureOptions = { pinRequired: false, whenNoPin: 'grant' };
const kioskPin: HiddenGestureOptions = { pinRequired: true, whenNoPin: 'grant' };
const kid: HiddenGestureOptions = { pinRequired: false, whenNoPin: 'confirm' };
const kidPin: HiddenGestureOptions = { pinRequired: true, whenNoPin: 'confirm' };

function press(state: HiddenGestureState, options: HiddenGestureOptions, start: number, end: number, inside = true) {
  const held = reduceHiddenGesture(state, { type: 'press-start', now: start }, options);
  return reduceHiddenGesture(held, { type: 'press-end', now: end, inside }, options);
}

describe('kiosk navigation visibility', () => {
  it('shows navigation whenever kiosk mode is off', () => {
    expect(kioskNavVisible(false, true, false)).toBe(true);
    expect(kioskNavVisible(false, false, false)).toBe(true);
  });

  it('hides navigation in kiosk mode until the gesture is granted', () => {
    expect(kioskNavVisible(true, true, false)).toBe(false);
    expect(kioskNavVisible(true, true, true)).toBe(true);
  });

  it('keeps navigation hidden when the reveal gesture is turned off', () => {
    expect(shouldOfferKioskGesture(true, false)).toBe(false);
    expect(kioskNavVisible(true, false, true)).toBe(false);
    expect(shouldOfferKioskGesture(true, true)).toBe(true);
  });

  it('places the hot zone on the sidebar side', () => {
    expect(kioskHotCorner('left')).toBe('left');
    expect(kioskHotCorner('bottom')).toBe('left');
    expect(kioskHotCorner('right')).toBe('right');
  });
});

describe('configured PINs', () => {
  it('keeps only digit PINs and ignores blanks', () => {
    expect(configuredMemberPins([
      { pin: '12-34' },
      { pin: '' },
      { pin: '   ' },
      {},
      { pin: null },
      { pin: '9999' },
    ])).toEqual(['1234', '9999']);
    expect(normalizePin('12ab345678')).toBe('123456');
  });
});

describe('hidden gesture', () => {
  it('starts idle so kiosk mode stays hidden', () => {
    expect(initialHiddenGestureState().phase).toBe('idle');
  });

  it('grants kiosk navigation on a 2 second press when no PIN is set', () => {
    const next = reduceHiddenGesture(
      { ...initialHiddenGestureState(), pressStartedAt: 0 },
      { type: 'press-hold-elapsed', now: HIDDEN_GESTURE_LONG_PRESS_MS },
      kiosk,
    );
    expect(next.phase).toBe('granted');
  });

  it('does not grant a press that is released early', () => {
    const next = press(initialHiddenGestureState(), kiosk, 0, HIDDEN_GESTURE_LONG_PRESS_MS - 1);
    expect(next.phase).toBe('idle');
    expect(next.taps).toEqual([]);
  });

  it('counts three quick taps and ignores a slow follow-up', () => {
    let state = initialHiddenGestureState();
    state = press(state, kiosk, 0, 40);
    expect(state.phase).toBe('idle');
    state = press(state, kiosk, 100, 140);
    expect(state.phase).toBe('idle');
    state = press(state, kiosk, 100 + HIDDEN_GESTURE_TAP_GAP_MS, 140 + HIDDEN_GESTURE_TAP_GAP_MS);
    expect(state.phase).toBe('granted');
  });

  it('restarts the tap sequence when the gap is too long', () => {
    let state = press(initialHiddenGestureState(), kiosk, 0, 30);
    state = press(state, kiosk, HIDDEN_GESTURE_TAP_GAP_MS + 50, HIDDEN_GESTURE_TAP_GAP_MS + 80);
    expect(state.phase).toBe('idle');
    expect(state.taps).toHaveLength(1);
  });

  it('drops the sequence when the finger leaves the hot zone', () => {
    const started = reduceHiddenGesture(
      initialHiddenGestureState(),
      { type: 'press-start', now: 0 },
      kiosk,
    );
    const next = reduceHiddenGesture(started, { type: 'press-end', now: 80, inside: false }, kiosk);
    expect(next.phase).toBe('idle');
    expect(next.taps).toEqual([]);
    expect(next.pressStartedAt).toBeNull();
  });

  it('does not treat a medium press as a tap', () => {
    const next = press(initialHiddenGestureState(), kiosk, 0, HIDDEN_GESTURE_TAP_MAX_MS + 1);
    expect(next.phase).toBe('idle');
    expect(next.taps).toEqual([]);
  });

  it('asks for a PIN before revealing kiosk navigation when one is configured', () => {
    const prompted = reduceHiddenGesture(
      { ...initialHiddenGestureState(), pressStartedAt: 0 },
      { type: 'press-hold-elapsed', now: HIDDEN_GESTURE_LONG_PRESS_MS },
      kioskPin,
    );
    expect(prompted.phase).toBe('pin');
    const wrong = reduceHiddenGesture(
      prompted,
      { type: 'submit-pin', now: 3000, pin: '0000', configuredPins: ['1234'] },
      kioskPin,
    );
    expect(wrong.phase).toBe('pin');
    expect(wrong.pinError).toBe(true);
    const right = reduceHiddenGesture(
      wrong,
      { type: 'submit-pin', now: 4000, pin: '12-34', configuredPins: ['1234'] },
      kioskPin,
    );
    expect(right.phase).toBe('granted');
  });

  it('accepts any configured family PIN', () => {
    const prompted = reduceHiddenGesture(initialHiddenGestureState(), { type: 'request', now: 0 }, kioskPin);
    const next = reduceHiddenGesture(
      prompted,
      { type: 'submit-pin', now: 10, pin: '5555', configuredPins: ['1234', '5555'] },
      kioskPin,
    );
    expect(next.phase).toBe('granted');
  });

  it('shows a confirm before leaving Kid Display when no PIN is set', () => {
    const prompted = reduceHiddenGesture(initialHiddenGestureState(), { type: 'request', now: 0 }, kid);
    expect(prompted.phase).toBe('confirm');
    const cancelled = reduceHiddenGesture(prompted, { type: 'cancel' }, kid);
    expect(cancelled.phase).toBe('idle');
    const again = reduceHiddenGesture(initialHiddenGestureState(), { type: 'request', now: 5 }, kid);
    const confirmed = reduceHiddenGesture(again, { type: 'confirm', now: 20 }, kid);
    expect(confirmed.phase).toBe('granted');
  });

  it('requires a PIN to leave Kid Display when one is configured', () => {
    const prompted = reduceHiddenGesture(initialHiddenGestureState(), { type: 'request', now: 0 }, kidPin);
    expect(prompted.phase).toBe('pin');
    expect(prompted.phase).not.toBe('confirm');
    const granted = reduceHiddenGesture(
      prompted,
      { type: 'submit-pin', now: 10, pin: '4321', configuredPins: ['4321'] },
      kidPin,
    );
    expect(granted.phase).toBe('granted');
  });

  it('ignores a second request while a dialog is open', () => {
    const prompted = reduceHiddenGesture(initialHiddenGestureState(), { type: 'request', now: 0 }, kid);
    const again = reduceHiddenGesture(prompted, { type: 'request', now: 50 }, kid);
    expect(again.phase).toBe('confirm');
  });

  it('returns to idle after 15 seconds without activity', () => {
    const granted = reduceHiddenGesture(initialHiddenGestureState(), { type: 'request', now: 0 }, kiosk);
    expect(granted.phase).toBe('granted');
    const still = reduceHiddenGesture(
      granted,
      { type: 'idle-elapsed', now: HIDDEN_GESTURE_IDLE_MS - 1 },
      kiosk,
    );
    expect(still.phase).toBe('granted');
    const active = reduceHiddenGesture(still, { type: 'activity', now: 10_000 }, kiosk);
    const notYet = reduceHiddenGesture(
      active,
      { type: 'idle-elapsed', now: 10_000 + HIDDEN_GESTURE_IDLE_MS - 1 },
      kiosk,
    );
    expect(notYet.phase).toBe('granted');
    const hidden = reduceHiddenGesture(
      notYet,
      { type: 'idle-elapsed', now: 10_000 + HIDDEN_GESTURE_IDLE_MS },
      kiosk,
    );
    expect(hidden.phase).toBe('idle');
  });

  it('dismisses an abandoned PIN prompt after the idle window', () => {
    const prompted = reduceHiddenGesture(initialHiddenGestureState(), { type: 'request', now: 0 }, kioskPin);
    const hidden = reduceHiddenGesture(
      prompted,
      { type: 'idle-elapsed', now: HIDDEN_GESTURE_IDLE_MS },
      kioskPin,
    );
    expect(hidden.phase).toBe('idle');
  });

  it('does not complete a hold that was cancelled', () => {
    const started = reduceHiddenGesture(initialHiddenGestureState(), { type: 'press-start', now: 0 }, kiosk);
    const cancelled = reduceHiddenGesture(started, { type: 'press-cancel' }, kiosk);
    const next = reduceHiddenGesture(
      cancelled,
      { type: 'press-hold-elapsed', now: HIDDEN_GESTURE_LONG_PRESS_MS },
      kiosk,
    );
    expect(next.phase).toBe('idle');
  });
});
