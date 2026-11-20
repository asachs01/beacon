import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import {
  HIDDEN_GESTURE_HOT_ZONE_PX,
  HIDDEN_GESTURE_IDLE_MS,
  HIDDEN_GESTURE_LONG_PRESS_MS,
  HIDDEN_GESTURE_MOVE_CANCEL_PX,
  configuredMemberPins,
  initialHiddenGestureState,
  reduceHiddenGesture,
  type HiddenGestureEvent,
  type HiddenGestureOptions,
  type HiddenGestureState,
  type KioskHotCorner,
} from '../display/hidden-gesture';

export interface HiddenCornerGestureHandle {
  /** Open the same PIN or confirm path the corner gesture uses. */
  request: () => void;
}

interface HiddenCornerGestureProps {
  /** Kiosk reveals navigation. Kid Display asks before leaving the screen. */
  purpose: 'kiosk' | 'kid-display';
  memberName?: string;
  corner: KioskHotCorner;
  members: readonly { pin?: string | null }[];
  onGrantedChange: (granted: boolean) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}

export const HiddenCornerGesture = forwardRef<HiddenCornerGestureHandle, HiddenCornerGestureProps>(
  function HiddenCornerGesture({ purpose, memberName, corner, members, onGrantedChange }, ref) {
    const { t } = useTranslation();
    const [state, setState] = useState<HiddenGestureState>(initialHiddenGestureState);
    const [draft, setDraft] = useState('');
    const stateRef = useRef(state);
    stateRef.current = state;
    const onGrantedChangeRef = useRef(onGrantedChange);
    onGrantedChangeRef.current = onGrantedChange;
    const pressTimer = useRef<number | null>(null);
    const origin = useRef<{ x: number; y: number } | null>(null);
    const pinInputRef = useRef<HTMLInputElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);

    const pins = configuredMemberPins(members);
    const optionsRef = useRef<HiddenGestureOptions>({ pinRequired: false, whenNoPin: 'grant' });
    optionsRef.current = {
      pinRequired: pins.length > 0,
      whenNoPin: purpose === 'kid-display' ? 'confirm' : 'grant',
    };
    const pinsRef = useRef(pins);
    pinsRef.current = pins;

    const reduce = (event: HiddenGestureEvent) => {
      setState((prev) => reduceHiddenGesture(prev, event, optionsRef.current));
    };

    const clearPressTimer = () => {
      if (pressTimer.current != null) {
        window.clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
    };

    const beginPress = (x?: number, y?: number) => {
      if (stateRef.current.phase !== 'idle') return;
      origin.current = x == null || y == null ? null : { x, y };
      reduce({ type: 'press-start', now: Date.now() });
      clearPressTimer();
      pressTimer.current = window.setTimeout(() => {
        pressTimer.current = null;
        origin.current = null;
        const started = stateRef.current.pressStartedAt ?? Date.now();
        reduce({
          type: 'press-hold-elapsed',
          now: Math.max(Date.now(), started + HIDDEN_GESTURE_LONG_PRESS_MS),
        });
      }, HIDDEN_GESTURE_LONG_PRESS_MS);
    };

    const finishPress = (inside: boolean) => {
      const pending = pressTimer.current != null;
      clearPressTimer();
      origin.current = null;
      if (!pending) return;
      reduce({ type: 'press-end', now: Date.now(), inside });
    };

    const cancelHold = () => {
      const pending = pressTimer.current != null;
      clearPressTimer();
      origin.current = null;
      if (!pending) return;
      reduce({ type: 'press-cancel' });
    };

    useImperativeHandle(ref, () => ({
      request: () => reduce({ type: 'request', now: Date.now() }),
    }), []);

    useEffect(() => {
      onGrantedChangeRef.current(state.phase === 'granted');
    }, [state.phase]);

    useEffect(() => () => onGrantedChangeRef.current(false), []);

    useEffect(() => {
      if (state.phase === 'idle' || state.lastActivityAt == null) return;
      const delay = HIDDEN_GESTURE_IDLE_MS - (Date.now() - state.lastActivityAt);
      const id = window.setTimeout(() => {
        reduce({ type: 'idle-elapsed', now: Date.now() });
      }, Math.max(0, delay));
      return () => window.clearTimeout(id);
      // `reduce` is recreated each render and closes over the latest options ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.phase, state.lastActivityAt]);

    useEffect(() => {
      if (state.phase === 'pin') {
        setDraft('');
        pinInputRef.current?.focus();
      } else if (state.phase === 'confirm') {
        cancelRef.current?.focus();
      }
    }, [state.phase]);

    useEffect(() => {
      const noteActivity = () => reduce({ type: 'activity', now: Date.now() });

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') {
          if (stateRef.current.phase !== 'idle' && !event.repeat) noteActivity();
          return;
        }
        if (event.repeat) return;
        const phase = stateRef.current.phase;
        if (phase === 'pin' || phase === 'confirm') {
          event.preventDefault();
          reduce({ type: 'cancel' });
          return;
        }
        if (phase !== 'idle') {
          noteActivity();
          return;
        }
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        beginPress();
      };

      const onKeyUp = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        // A short Escape must not count as a tap. Only the full hold reveals.
        cancelHold();
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        clearPressTimer();
      };
      // Listeners read the latest phase and options through refs.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      if (state.phase === 'idle') return;
      const noteActivity = () => reduce({ type: 'activity', now: Date.now() });
      window.addEventListener('pointerdown', noteActivity, true);
      window.addEventListener('pointerup', noteActivity, true);
      return () => {
        window.removeEventListener('pointerdown', noteActivity, true);
        window.removeEventListener('pointerup', noteActivity, true);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.phase]);

    const movedTooFar = (x: number, y: number) => {
      const start = origin.current;
      if (!start) return false;
      const dx = x - start.x;
      const dy = y - start.y;
      return dx * dx + dy * dy > HIDDEN_GESTURE_MOVE_CANCEL_PX * HIDDEN_GESTURE_MOVE_CANCEL_PX;
    };

    const submitPin = (pin: string) => {
      setDraft('');
      reduce({
        type: 'submit-pin',
        now: Date.now(),
        pin,
        configuredPins: pinsRef.current,
      });
    };

    const pinPrompt = purpose === 'kid-display'
      ? t('gesture.pinPromptExit')
      : t('gesture.pinPromptNav');
    const pinSubmit = purpose === 'kid-display' ? t('gesture.exit') : t('gesture.showNavigation');

    return (
      <>
        {state.phase === 'idle' && (
          <button
            type="button"
            className={`kiosk-reveal-hotzone kiosk-reveal-hotzone--${corner}`}
            style={{ width: HIDDEN_GESTURE_HOT_ZONE_PX, height: HIDDEN_GESTURE_HOT_ZONE_PX }}
            aria-label={t('gesture.hotZone')}
            aria-describedby="kiosk-reveal-hint"
            aria-keyshortcuts="Escape"
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const el = event.currentTarget;
              try { el.setPointerCapture(event.pointerId); } catch { /* jsdom */ }
              beginPress(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (movedTooFar(event.clientX, event.clientY)) cancelHold();
            }}
            onPointerUp={(event) => {
              finishPress(!movedTooFar(event.clientX, event.clientY));
            }}
            onPointerCancel={() => cancelHold()}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              if (event.repeat) return;
              event.preventDefault();
              beginPress();
            }}
            onKeyUp={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              finishPress(true);
            }}
          >
            <span id="kiosk-reveal-hint" className="kiosk-reveal-sr">
              {t('gesture.hotZoneHint')}
            </span>
          </button>
        )}

        {state.phase === 'pin' && (
          <div className="kiosk-reveal-backdrop" onClick={() => reduce({ type: 'cancel' })}>
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="kiosk-reveal-pin-title"
              className="kiosk-reveal-dialog"
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                submitPin(draft);
              }}
            >
              <h2 id="kiosk-reveal-pin-title" className="kiosk-reveal-title">{t('gesture.pinTitle')}</h2>
              <p className="kiosk-reveal-copy">{pinPrompt}</p>
              <label className="kiosk-reveal-label" htmlFor="kiosk-reveal-pin">
                {t('gesture.pinLabel')}
              </label>
              <input
                id="kiosk-reveal-pin"
                ref={pinInputRef}
                className="settings-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={draft}
                aria-invalid={state.pinError || undefined}
                onChange={(event) => {
                  setDraft(event.target.value.replace(/\D/g, '').slice(0, 6));
                  if (state.pinError) {
                    setState((prev) => (prev.pinError ? { ...prev, pinError: false } : prev));
                  }
                }}
              />
              {state.pinError && (
                <p className="kiosk-reveal-error" role="alert">{t('gesture.pinError')}</p>
              )}
              <div className="kiosk-reveal-actions">
                <button
                  type="button"
                  className="settings-btn"
                  onClick={() => reduce({ type: 'cancel' })}
                >
                  {t('common.cancel')}
                </button>
                <button type="submit" className="settings-btn settings-btn--primary">
                  {pinSubmit}
                </button>
              </div>
            </form>
          </div>
        )}

        {state.phase === 'confirm' && (
          <div className="kiosk-reveal-backdrop" onClick={() => reduce({ type: 'cancel' })}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="kiosk-reveal-confirm-title"
              className="kiosk-reveal-dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="kiosk-reveal-confirm-title" className="kiosk-reveal-title">
                {t('gesture.confirmExitTitle')}
              </h2>
              <p className="kiosk-reveal-copy">
                {t('gesture.confirmExitBody', { name: memberName ?? '' })}
              </p>
              <div className="kiosk-reveal-actions">
                <button
                  ref={cancelRef}
                  type="button"
                  className="settings-btn"
                  onClick={() => reduce({ type: 'cancel' })}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="settings-btn settings-btn--primary"
                  onClick={() => reduce({ type: 'confirm', now: Date.now() })}
                >
                  {t('gesture.exit')}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  },
);
