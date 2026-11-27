import { useEffect, useState } from 'react';
import { getIngressBasePath } from '../utils/ha-env';
import { PAIRING_REQUIRED_EVENT } from '../api/device-session';

export type PairingStatus = 'checking' | 'required' | 'ready';

/**
 * Ask Beacon whether this browser already has a session. Vite dev and the
 * demo build have no pairing endpoint; those stay on the dashboard.
 * A later 401 `{error:'pairing_required'}` (revoked session) shows the screen.
 */
export function useDevicePairing(enabled: boolean): {
  status: PairingStatus;
  markReady: () => void;
} {
  const [status, setStatus] = useState<PairingStatus>(enabled ? 'checking' : 'ready');

  useEffect(() => {
    if (!enabled) {
      setStatus('ready');
      return;
    }
    let cancelled = false;
    const base = getIngressBasePath();
    fetch(`${base}/beacon-auth/session`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (data && typeof data.paired === 'boolean') {
          setStatus(data.paired ? 'ready' : 'required');
        } else {
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('ready');
      });

    function onRequired() {
      setStatus('required');
    }
    window.addEventListener(PAIRING_REQUIRED_EVENT, onRequired);
    return () => {
      cancelled = true;
      window.removeEventListener(PAIRING_REQUIRED_EVENT, onRequired);
    };
  }, [enabled]);

  return {
    status,
    markReady: () => setStatus('ready'),
  };
}
