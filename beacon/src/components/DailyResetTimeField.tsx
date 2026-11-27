import { useEffect, useState } from 'react';
import { isValidChoreResetTime } from '../api/chore-reset-time';
import { useTranslation } from '../i18n';

interface DailyResetTimeFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Settings → Chores → Daily Reset Time.
 * Only HH:mm from 00:00 to 23:59 is saved. An empty or invalid entry stays
 * on screen with an error and leaves the stored value alone. The chore-day
 * helpers still treat a missing or invalid stored time as midnight.
 */
export function DailyResetTimeField({ id, value, onChange }: DailyResetTimeFieldProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const errorId = `${id}-error`;
  const invalid = !isValidChoreResetTime(draft);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="settings-time-field">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder="HH:mm"
        maxLength={8}
        className="settings-time-input"
        aria-label={t('settings.chores.dailyResetTimeLabel')}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const trimmed = next.trim();
          if (!isValidChoreResetTime(trimmed) || trimmed === value) return;
          onChange(trimmed);
        }}
      />
      {invalid && (
        <p id={errorId} className="settings-field-error" role="alert">
          {t('settings.chores.dailyResetTimeInvalid')}
        </p>
      )}
    </div>
  );
}
