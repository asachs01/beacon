import { useCallback, useEffect, useState } from 'react';
import { getIngressBasePath } from '../utils/ha-env';
import { useTranslation } from '../i18n';

interface PairedDevice {
  id: string;
  label: string;
  kind?: 'device' | 'token';
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

interface DeviceList {
  pairingCode: string;
  devices: PairedDevice[];
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

/** Settings list of paired devices, the current pairing code, and revoke. */
export function PairedDevicesSettings() {
  const { t } = useTranslation();
  const [list, setList] = useState<DeviceList | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [tokenLabel, setTokenLabel] = useState('');
  const [createdToken, setCreatedToken] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const base = getIngressBasePath();
    try {
      const res = await fetch(`${base}/beacon-auth/devices`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (res.status === 404 || !data || !Array.isArray(data.devices)) {
        setUnavailable(true);
        return;
      }
      if (!res.ok) {
        setError(t('settings.devices.loadFailed'));
        return;
      }
      setUnavailable(false);
      setList({ pairingCode: String(data.pairingCode || ''), devices: data.devices });
    } catch {
      setUnavailable(true);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function rotatePairingCode() {
    setNotice('');
    setError('');
    if (!window.confirm(t('settings.devices.rotateConfirm'))) return;
    const base = getIngressBasePath();
    const res = await fetch(`${base}/beacon-auth/pairing-code/rotate`, { method: 'POST' });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.pairingCode) {
      setError(t('settings.devices.loadFailed'));
      return;
    }
    setList((current) => current ? { ...current, pairingCode: data.pairingCode } : current);
    setNotice(t('settings.devices.regenerated'));
  }

  async function createToken() {
    setNotice('');
    setError('');
    setCopied(false);
    const base = getIngressBasePath();
    const label = tokenLabel.trim();
    const res = await fetch(`${base}/beacon-auth/access-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || typeof data?.token !== 'string' || !data.token) {
      setError(t('settings.devices.createFailed'));
      return;
    }
    setCreatedToken(data.token);
    setTokenLabel('');
    await load();
  }

  async function copyToken() {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function revoke(device: PairedDevice) {
    setNotice('');
    setError('');
    const base = getIngressBasePath();
    const res = await fetch(`${base}/beacon-auth/devices/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: device.id }),
    });
    if (!res.ok) {
      setError(t('settings.devices.loadFailed'));
      return;
    }
    await load();
  }

  return (
    <>
      <h2 className="settings-section-title">{t('settings.devices.title')}</h2>
      <p className="settings-section-desc">{t('settings.devices.desc')}</p>
      {unavailable && <p className="settings-section-desc">{t('settings.devices.unavailable')}</p>}
      {list && (
        <div className="settings-group">
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.devices.pairingCodeLabel')}</div>
              <div className="settings-row-sublabel">{t('settings.devices.pairingCodeSublabel')}</div>
            </div>
            <div className="settings-pairing-actions">
              <div className="pair-device-code">{list.pairingCode}</div>
              <button type="button" className="settings-btn" onClick={() => { void rotatePairingCode(); }}>
                {t('settings.devices.regenerate')}
              </button>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.devices.tokenHeading')}</div>
              <div className="settings-row-sublabel">{t('settings.devices.tokenDesc')}</div>
            </div>
          </div>
          <div className="settings-token-controls">
            <label className="settings-row-label" htmlFor="beacon-access-token-label">
              {t('settings.devices.tokenLabel')}
            </label>
            <input
              id="beacon-access-token-label"
              className="settings-input settings-input--wide"
              value={tokenLabel}
              placeholder={t('settings.devices.tokenPlaceholder')}
              maxLength={80}
              onChange={(event) => setTokenLabel(event.target.value)}
            />
            <button type="button" className="settings-btn settings-btn--primary" onClick={() => { void createToken(); }}>
              {t('settings.devices.createToken')}
            </button>
          </div>
          {createdToken && (
            <div className="settings-token-reveal" role="status">
              <div className="settings-row-label">{t('settings.devices.tokenOnce')}</div>
              <input
                className="settings-input settings-token-value"
                readOnly
                value={createdToken}
                aria-label={t('settings.devices.tokenOnce')}
              />
              <button type="button" className="settings-btn" onClick={() => { void copyToken(); }}>
                {copied ? t('settings.devices.copied') : t('settings.devices.copyToken')}
              </button>
            </div>
          )}
          {list.devices.length === 0 && (
            <p className="settings-section-desc">{t('settings.devices.empty')}</p>
          )}
          {list.devices.map((device) => (
            <div className="settings-row" key={device.id}>
              <div>
                <div className="settings-row-label">
                  {device.label}
                  {device.kind === 'token' ? ` · ${t('settings.devices.tokenKind')}` : ''}
                  {device.current ? ` · ${t('settings.devices.current')}` : ''}
                </div>
                <div className="settings-row-sublabel">
                  {t('settings.devices.lastSeen', { when: formatWhen(device.lastSeenAt) })}
                </div>
              </div>
              <button type="button" className="settings-btn settings-btn--danger" onClick={() => { void revoke(device); }}>
                {t('settings.devices.revoke')}
              </button>
            </div>
          ))}
        </div>
      )}
      {notice && <p className="settings-section-desc" role="status">{notice}</p>}
      {error && <p className="pair-device-error" role="alert">{error}</p>}
    </>
  );
}
