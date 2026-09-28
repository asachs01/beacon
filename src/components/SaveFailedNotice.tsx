import { useEffect, useState } from 'react';
import { onSaveFailed } from '../utils/save-errors';

const SHOW_FOR_MS = 8000;

/**
 * "Couldn't save that change" for a few seconds after persistence rejects
 * a change (a chore tick, a new member...), so it doesn't look like the tap
 * did nothing.
 */
export function SaveFailedNotice() {
  const [shownAt, setShownAt] = useState<number | null>(null);

  useEffect(() => onSaveFailed(() => setShownAt(Date.now())), []);

  useEffect(() => {
    if (shownAt === null) return;
    const timer = setTimeout(() => setShownAt(null), SHOW_FOR_MS);
    return () => clearTimeout(timer);
  }, [shownAt]);

  if (shownAt === null) return null;
  return (
    <div className="save-failed-notice" role="alert" onClick={() => setShownAt(null)}>
      Couldn't save that change. Please try again.
    </div>
  );
}
