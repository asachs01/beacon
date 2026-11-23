import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { HIDDEN_GESTURE_HOT_ZONE_PX } from '../display/hidden-gesture';
import { NIGHT_WAKE_MS, nightDimOpacity } from '../display/night-mode';
import { applyNativeNightBrightness } from '../display/native-brightness';
import { useNightWakeHeld } from '../display/night-wake';
import { useTranslation } from '../i18n';

export interface NightModeProps {
  /** Schedule says night mode is on, including the 60 second wake. */
  active: boolean;
  brightness: number;
  clockOnly: boolean;
  timeFormat: '12h' | '24h';
  hotCorner: 'left' | 'right';
}

/**
 * Dim overlay and optional clock shown while night mode is active.
 * A tap, or an urgent wake, reveals the normal dashboard. The theme stays
 * dark until the schedule ends; that switch lives in App via useTheme.
 */
export function NightMode({
  active,
  brightness,
  clockOnly,
  timeFormat,
  hotCorner,
}: NightModeProps) {
  const { t, dateLocale } = useTranslation();
  const urgent = useNightWakeHeld();
  const [wokenUntil, setWokenUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!active) setWokenUntil(null);
  }, [active]);

  useEffect(() => {
    if (wokenUntil == null) return;
    const delay = Math.max(0, wokenUntil - Date.now());
    const id = window.setTimeout(() => setWokenUntil(null), delay);
    return () => window.clearTimeout(id);
  }, [wokenUntil]);

  const tapWoken = wokenUntil != null && Date.now() < wokenUntil;
  const presenting = active && !tapWoken && !urgent;
  const showClock = presenting && clockOnly;

  useEffect(() => {
    if (!showClock) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [showClock]);

  useEffect(() => {
    if (!presenting) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      setWokenUntil(Date.now() + NIGHT_WAKE_MS);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [presenting]);

  useEffect(() => {
    if (!showClock) return;
    document.documentElement.classList.add('night-clock-active');
    return () => document.documentElement.classList.remove('night-clock-active');
  }, [showClock]);

  useEffect(() => {
    void applyNativeNightBrightness(presenting ? brightness : null);
    return () => {
      void applyNativeNightBrightness(null);
    };
  }, [presenting, brightness]);

  if (!presenting) return null;

  const opacity = nightDimOpacity(brightness);
  const timePattern = timeFormat === '24h' ? 'HH:mm' : 'h:mm a';

  return (
    <>
      {showClock && (
        <div
          className={`night-clock-screen night-clock-screen--hole-${hotCorner}`}
          style={{ ['--night-hot-zone' as string]: `${HIDDEN_GESTURE_HOT_ZONE_PX}px` }}
          data-testid="night-clock"
          role="group"
          aria-label={t('nightMode.clock')}
        >
          <div className="night-clock-time">{format(now, timePattern, { locale: dateLocale })}</div>
          <div className="night-clock-date">{format(now, 'EEEE, MMMM d', { locale: dateLocale })}</div>
        </div>
      )}
      {opacity > 0 && (
        <div
          className="night-dim"
          data-testid="night-dim"
          aria-hidden="true"
          style={{ opacity, pointerEvents: 'none' }}
        />
      )}
    </>
  );
}
