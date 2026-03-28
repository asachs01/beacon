import { useState, useEffect } from 'react';
import { format } from 'date-fns';

export function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="clock-mini">
      {format(now, 'h:mm a')}
    </span>
  );
}
