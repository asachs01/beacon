import { useClock, byMinute, bySecond } from '../hooks/useClock';
import { formatClockTime, type TimeFormat } from '../utils/time-format';

export function Clock({ timeFormat = '12h', showSeconds = false }: { timeFormat?: TimeFormat; showSeconds?: boolean }) {
  const now = useClock(showSeconds ? bySecond : byMinute);

  return (
    <span className="clock-mini">
      {formatClockTime(now, timeFormat, showSeconds)}
    </span>
  );
}
