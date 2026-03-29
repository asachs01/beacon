import { useState, useCallback } from 'react';
import { ArrowRight, Check, ExternalLink, Key, LogIn } from 'lucide-react';
import beaconLogo from '../assets/beacon-icon.svg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardingViewProps {
  onComplete: (haUrl: string, haToken: string) => void;
  onOAuthStart?: (haUrl: string) => void;
}

type Step = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Styles (inline, using CSS custom properties from the app theme)
// ---------------------------------------------------------------------------

const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    fontFamily: 'var(--font-body)',
    padding: 20,
  } as React.CSSProperties,

  container: {
    width: '100%',
    maxWidth: 480,
    padding: 40,
    background: 'var(--bg-surface)',
    borderRadius: 'var(--radius-xl)',
    boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--border)',
  } as React.CSSProperties,

  logo: {
    width: 72,
    height: 72,
    marginBottom: 24,
  } as React.CSSProperties,

  heading: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.75rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: '0 0 8px',
  } as React.CSSProperties,

  subtext: {
    fontSize: '0.95rem',
    color: 'var(--text-secondary)',
    margin: '0 0 32px',
    lineHeight: 1.5,
  } as React.CSSProperties,

  stepIndicator: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 32,
  } as React.CSSProperties,

  stepDot: (active: boolean, completed: boolean): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: completed
      ? 'var(--accent)'
      : active
        ? 'var(--accent)'
        : 'var(--border)',
    opacity: active || completed ? 1 : 0.5,
    transition: 'all var(--transition)',
  }),

  primaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '14px 24px',
    background: 'var(--accent)',
    color: '#ffffff',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all var(--transition)',
  } as React.CSSProperties,

  primaryButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '12px 16px',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'border-color var(--transition)',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  inputError: {
    borderColor: '#ef4444',
  } as React.CSSProperties,

  label: {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 8,
  } as React.CSSProperties,

  errorText: {
    fontSize: '0.82rem',
    color: '#ef4444',
    marginTop: 8,
    lineHeight: 1.4,
  } as React.CSSProperties,

  card: (selected: boolean): React.CSSProperties => ({
    padding: 20,
    background: selected ? 'var(--bg-today)' : 'var(--bg-primary)',
    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-lg)',
    cursor: 'pointer',
    transition: 'all var(--transition)',
  }),

  cardTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  } as React.CSSProperties,

  cardDesc: {
    fontSize: '0.82rem',
    color: 'var(--text-secondary)',
    margin: '8px 0 0',
    lineHeight: 1.5,
  } as React.CSSProperties,

  hint: {
    fontSize: '0.78rem',
    color: 'var(--text-secondary)',
    margin: '12px 0 0',
    lineHeight: 1.5,
    padding: '10px 12px',
    background: 'var(--bg-primary)',
    borderRadius: 'var(--radius-sm)',
  } as React.CSSProperties,

  secondaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '12px 24px',
    background: 'transparent',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all var(--transition)',
  } as React.CSSProperties,
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingView({ onComplete, onOAuthStart }: OnboardingViewProps) {
  const [step, setStep] = useState<Step>(1);
  const [haUrl, setHaUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [connecting, setConnecting] = useState(false);

  const [authMethod, setAuthMethod] = useState<'token' | 'oauth' | null>(null);
  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState('');

  // ---- URL validation ----
  const isValidUrl = useCallback((url: string): boolean => {
    const trimmed = url.trim();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://');
  }, []);

  // ---- Test HA connection ----
  const testConnection = useCallback(async () => {
    const trimmed = haUrl.trim().replace(/\/+$/, '');
    if (!isValidUrl(trimmed)) {
      setUrlError('URL must start with http:// or https://');
      return;
    }
    setUrlError('');
    setConnecting(true);
    try {
      const response = await fetch(`${trimmed}/api/`, { method: 'HEAD' });
      if (response.ok || response.status === 401) {
        // 401 is expected without auth — the server is reachable
        setHaUrl(trimmed);
        setStep(3);
      } else {
        setUrlError(`Connection failed (HTTP ${response.status}). Check the URL and try again.`);
      }
    } catch {
      setUrlError('Could not reach Home Assistant. Verify the URL and ensure it is accessible.');
    } finally {
      setConnecting(false);
    }
  }, [haUrl, isValidUrl]);

  // ---- Complete setup ----
  const handleComplete = useCallback(() => {
    if (!token.trim()) {
      setTokenError('Please enter your access token.');
      return;
    }
    setTokenError('');
    onComplete(haUrl, token.trim());
  }, [haUrl, token, onComplete]);

  // ---- Render steps ----

  const renderStepIndicator = () => (
    <div style={styles.stepIndicator}>
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          style={styles.stepDot(s === step, s < step)}
        />
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div style={{ textAlign: 'center' }}>
      <img src={beaconLogo} alt="Beacon" style={styles.logo} />
      <h1 style={styles.heading}>Welcome to Beacon</h1>
      <p style={styles.subtext}>Connect your Home Assistant to get started.</p>
      <button
        style={styles.primaryButton}
        onClick={() => setStep(2)}
      >
        Get Started
        <ArrowRight size={18} />
      </button>
    </div>
  );

  const renderStep2 = () => (
    <div>
      <h1 style={{ ...styles.heading, textAlign: 'center' }}>Connect to Home Assistant</h1>
      <p style={{ ...styles.subtext, textAlign: 'center' }}>
        Enter the URL of your Home Assistant instance.
      </p>

      <div style={{ marginBottom: 24 }}>
        <label style={styles.label}>Home Assistant URL</label>
        <input
          type="url"
          placeholder="https://homeassistant.local:8123"
          value={haUrl}
          onChange={(e) => {
            setHaUrl(e.target.value);
            if (urlError) setUrlError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') testConnection();
          }}
          style={{
            ...styles.input,
            ...(urlError ? styles.inputError : {}),
          }}
        />
        {urlError && <p style={styles.errorText}>{urlError}</p>}
      </div>

      <button
        style={{
          ...styles.primaryButton,
          ...(connecting || !haUrl.trim() ? styles.primaryButtonDisabled : {}),
        }}
        disabled={connecting || !haUrl.trim()}
        onClick={testConnection}
      >
        {connecting ? 'Connecting...' : 'Connect'}
        {!connecting && <ArrowRight size={18} />}
      </button>
    </div>
  );

  const renderStep3 = () => (
    <div>
      <h1 style={{ ...styles.heading, textAlign: 'center' }}>Authentication</h1>
      <p style={{ ...styles.subtext, textAlign: 'center' }}>
        Choose how to authenticate with Home Assistant.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
        {/* Token auth card */}
        <div
          style={styles.card(authMethod === 'token')}
          onClick={() => setAuthMethod('token')}
        >
          <h3 style={styles.cardTitle}>
            <Key size={18} color="var(--accent)" />
            Long-lived Access Token
          </h3>
          <p style={styles.cardDesc}>
            Use a token generated from your Home Assistant profile.
          </p>

          {authMethod === 'token' && (
            <div style={{ marginTop: 16 }}>
              <input
                type="password"
                placeholder="Paste your token here"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  if (tokenError) setTokenError('');
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  ...styles.input,
                  ...(tokenError ? styles.inputError : {}),
                }}
              />
              {tokenError && <p style={styles.errorText}>{tokenError}</p>}
              <div style={styles.hint}>
                <span style={{ fontWeight: 600 }}>How to create a token:</span>
                <br />
                Go to your HA Profile &rarr; Long-lived tokens &rarr; Create Token
              </div>
            </div>
          )}
        </div>

        {/* OAuth card */}
        <div
          style={styles.card(authMethod === 'oauth')}
          onClick={() => setAuthMethod('oauth')}
        >
          <h3 style={styles.cardTitle}>
            <LogIn size={18} color="var(--accent)" />
            Sign in with Home Assistant
          </h3>
          <p style={styles.cardDesc}>
            Authenticate using your Home Assistant credentials via OAuth2.
          </p>

          {authMethod === 'oauth' && (
            <div style={{ marginTop: 16 }}>
              <button
                style={styles.secondaryButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onOAuthStart?.(haUrl);
                }}
              >
                Open Home Assistant
                <ExternalLink size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {authMethod === 'token' && (
        <button
          style={{
            ...styles.primaryButton,
            ...((!token.trim()) ? styles.primaryButtonDisabled : {}),
          }}
          disabled={!token.trim()}
          onClick={handleComplete}
        >
          Complete Setup
          <Check size={18} />
        </button>
      )}
    </div>
  );

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        {renderStepIndicator()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  );
}
