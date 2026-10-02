import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useTranslation } from '../i18n';

export function Clock() {
  const { dateLocale } = useTranslation();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="clock-mini">
      {format(now, 'h:mm a', { locale: dateLocale })}
    </span>
  );
}
