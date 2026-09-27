import { useClock } from '../hooks/useClock';
import { formatClockTime, type TimeFormat } from '../utils/time-format';

export function Clock({ timeFormat = '12h' }: { timeFormat?: TimeFormat }) {
  const now = useClock();

  return (
    <span className="clock-mini">
      {formatClockTime(now, timeFormat)}
    </span>
  );
}
