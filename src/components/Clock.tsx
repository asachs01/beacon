import { useState, useEffect } from 'react';
import { format } from 'date-fns';

export function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = format(now, 'h:mm');
  const seconds = format(now, 'ss');
  const ampm = format(now, 'a');
  const dayOfWeek = format(now, 'EEEE');
  const date = format(now, 'MMMM d, yyyy');

  return (
    <div className="clock">
      <div className="clock-time">
        <span className="clock-digits">{time}</span>
        <span className="clock-seconds">
          <span>{seconds}</span>
          <span className="clock-ampm">{ampm}</span>
        </span>
      </div>
      <div className="clock-date">
        <div className="clock-day">{dayOfWeek}</div>
        <div className="clock-full-date">{date}</div>
      </div>
    </div>
  );
}
