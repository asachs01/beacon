import { useEffect, useState } from 'react';
import { applyFontPreferences, type FontApplyStatus } from '../fonts/apply';
import { SYSTEM_FONT_STACK, type FontSelection } from '../fonts/selection';

export type { FontApplyStatus };

const QUIET: FontApplyStatus = { headingFellBack: false, bodyFellBack: false };

/**
 * Keep `--font-family-heading` and `--font-family-body` in sync with settings.
 * Mounted once at the app root so every view, not only Settings, picks up the choice.
 */
export function useAppliedFonts(headingFont: FontSelection, bodyFont: FontSelection): FontApplyStatus {
  const [status, setStatus] = useState<FontApplyStatus>(QUIET);
  const headingKey = JSON.stringify(headingFont);
  const bodyKey = JSON.stringify(bodyFont);

  useEffect(() => {
    let cancelled = false;
    setStatus(QUIET);
    void applyFontPreferences(headingFont, bodyFont)
      .then((result) => {
        if (!cancelled && result) setStatus(result);
      })
      .catch(() => {
        if (cancelled) return;
        document.documentElement.style.setProperty('--font-family-heading', SYSTEM_FONT_STACK);
        document.documentElement.style.setProperty('--font-family-body', SYSTEM_FONT_STACK);
        setStatus({ headingFellBack: true, bodyFellBack: true });
      });
    return () => {
      cancelled = true;
    };
  }, [headingFont, bodyFont, headingKey, bodyKey]);

  return status;
}
