import { useState, type FormEvent } from 'react';
import { getIngressBasePath } from '../utils/ha-env';
import { saveDeviceSession } from '../api/device-session';
import { useTranslation } from '../i18n';

interface PairDeviceScreenProps {
  onPaired: () => void;
}

/**
 * Shown when Beacon returns 401 {error:'pairing_required'}. The family PIN
 * or the 6-digit pairing code from the add-on log pairs this browser once.
 */
export function PairDeviceScreen({ onPaired }: PairDeviceScreenProps) {
  const { t } = useTranslation();
  const [secret, setSecret] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const base = getIngressBasePath();
      const res = await fetch(`${base}/beacon-auth/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, label }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 429) {
        const minutes = Math.max(1, Math.ceil(Number(data?.retryAfter || 60) / 60));
        setError(t('pairing.locked', { minutes }));
        return;
      }
      if (!res.ok || !data?.token) {
        setError(t('pairing.failed'));
        return;
      }
      await saveDeviceSession(String(data.token));
      onPaired();
    } catch {
      setError(t('pairing.network'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pair-device">
      <form className="pair-device-card" onSubmit={submit}>
        <h1 className="pair-device-title">{t('pairing.title')}</h1>
        <p className="pair-device-subtitle">{t('pairing.subtitle')}</p>
        <label className="pair-device-field">
          <span>{t('pairing.secretLabel')}</span>
          <input
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            required
          />
        </label>
        <label className="pair-device-field">
          <span>{t('pairing.labelLabel')}</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t('pairing.labelPlaceholder')}
            autoComplete="off"
            maxLength={80}
          />
        </label>
        {error && <p className="pair-device-error" role="alert">{error}</p>}
        <button type="submit" className="settings-btn pair-device-submit" disabled={busy || secret.trim() === ''}>
          {busy ? t('pairing.working') : t('pairing.submit')}
        </button>
      </form>
    </div>
  );
}
