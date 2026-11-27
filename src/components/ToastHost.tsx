import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';
import { subscribeToasts, type ToastNotice } from '../ui/toast';
import '../styles/toast.css';

/** Fixed message for write failures and other short notices. */
export function ToastHost() {
  const { t } = useTranslation();
  const [notice, setNotice] = useState<ToastNotice | null>(null);

  useEffect(() => subscribeToasts(setNotice), []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;

  return (
    <div className="beacon-toast" role="status" aria-live="polite">
      {t(notice.messageKey)}
    </div>
  );
}
