import { useState, useCallback } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  X,
  Sun,
  Calendar,
  Home,
  Users,
  Cloud,
} from 'lucide-react';
import beaconLogo from '../assets/beacon-icon.svg';
import {
  FamilyMember,
  MEMBER_COLORS,
  AVATAR_CATEGORIES,
} from '../types/family';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardingViewProps {
  onComplete: (data: OnboardingData) => void;
}

export interface OnboardingData {
  familyName: string;
  members: Omit<FamilyMember, 'id'>[];
  weatherLocation: string;
  owmApiKey: string;
  calendarMode: 'local' | 'ha';
  /** Only set if calendarMode === 'ha' */
  haUrl?: string;
  haToken?: string;
}

type Step = 'welcome' | 'family' | 'weather' | 'calendar' | 'done';

const STEPS: Step[] = ['welcome', 'family', 'weather', 'calendar', 'done'];

// ---------------------------------------------------------------------------
// Styles
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
    maxWidth: 520,
    padding: 'clamp(16px, 4vw, 32px) clamp(16px, 5vw, 40px)',
    background: 'var(--bg-surface)',
    borderRadius: 'var(--radius-xl)',
    boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--border)',
  } as React.CSSProperties,

  logo: {
    width: 72,
    height: 72,
    marginBottom: 20,
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
    margin: '0 0 28px',
    lineHeight: 1.5,
  } as React.CSSProperties,

  stepIndicator: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 28,
  } as React.CSSProperties,

  stepDot: (active: boolean, completed: boolean): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: completed || active ? 'var(--accent)' : 'var(--border)',
    opacity: active || completed ? 1 : 0.4,
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

  secondaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '12px 24px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all var(--transition)',
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

  label: {
    display: 'block',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 8,
  } as React.CSSProperties,

  card: (selected: boolean): React.CSSProperties => ({
    padding: 16,
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
    margin: '6px 0 0',
    lineHeight: 1.5,
  } as React.CSSProperties,

  memberRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    background: 'var(--bg-primary)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 8,
  } as React.CSSProperties,

  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: '2px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.2rem',
    cursor: 'pointer',
    flexShrink: 0,
  } as React.CSSProperties,

  avatarPicker: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))',
    gap: 4,
    maxHeight: 160,
    overflowY: 'auto' as const,
    padding: 8,
    background: 'var(--bg-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    marginTop: 8,
  } as React.CSSProperties,

  avatarOption: (selected: boolean): React.CSSProperties => ({
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.2rem',
    borderRadius: 'var(--radius-sm)',
    border: selected ? '2px solid var(--accent)' : '2px solid transparent',
    background: selected ? 'var(--bg-today)' : 'transparent',
    cursor: 'pointer',
  }),

  removeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,

  navRow: {
    display: 'flex',
    gap: 12,
    marginTop: 24,
  } as React.CSSProperties,

  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '12px 20px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all var(--transition)',
    flexShrink: 0,
  } as React.CSSProperties,

  skipLink: {
    display: 'block',
    textAlign: 'center' as const,
    marginTop: 12,
    fontSize: '0.82rem',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontFamily: 'var(--font-body)',
  } as React.CSSProperties,
} as const;

// ---------------------------------------------------------------------------
// Member editing sub-component
// ---------------------------------------------------------------------------

interface MemberDraft {
  _id: number; // stable key for React rendering
  name: string;
  avatar: string;
  color: string;
  role: 'parent' | 'child';
}

let _nextMemberId = 0;
function defaultMember(index: number): MemberDraft {
  return {
    _id: _nextMemberId++,
    name: '',
    avatar: '🧑',
    color: MEMBER_COLORS[index % MEMBER_COLORS.length],
    role: index === 0 ? 'parent' : 'child',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingView({ onComplete }: OnboardingViewProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [familyName, setFamilyName] = useState('');
  const [members, setMembers] = useState<MemberDraft[]>([defaultMember(0)]);
  const [weatherLocation, setWeatherLocation] = useState('');
  const [calendarMode, setCalendarMode] = useState<'local' | 'ha'>('local');
  const [haUrl, setHaUrl] = useState('');
  const [haToken, setHaToken] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState<number | null>(null);
  const [owmApiKey, setOwmApiKey] = useState('');
  const [haValidating, setHaValidating] = useState(false);
  const [haValidationError, setHaValidationError] = useState<string | null>(null);

  const stepIndex = STEPS.indexOf(step);

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }, [step]);

  const goBack = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }, [step]);

  const handleComplete = useCallback(() => {
    onComplete({
      familyName: familyName.trim() || 'My Family',
      members: members
        .filter((m) => m.name.trim())
        .map((m) => ({
          name: m.name.trim(),
          avatar: m.avatar,
          color: m.color,
          role: m.role,
        })),
      weatherLocation: weatherLocation.trim(),
      owmApiKey: owmApiKey.trim(),
      calendarMode,
      haUrl: calendarMode === 'ha' ? haUrl.trim() : undefined,
      haToken: calendarMode === 'ha' ? haToken.trim() : undefined,
    });
  }, [familyName, members, weatherLocation, owmApiKey, calendarMode, haUrl, haToken, onComplete]);

  // Member management
  const addMember = useCallback(() => {
    setMembers((prev) => [...prev, defaultMember(prev.length)]);
  }, []);

  const removeMember = useCallback((index: number) => {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateMember = useCallback(
    (index: number, patch: Partial<MemberDraft>) => {
      setMembers((prev) =>
        prev.map((m, i) => (i === index ? { ...m, ...patch } : m)),
      );
    },
    [],
  );

  // ---- Step indicator ----
  const renderStepIndicator = () => (
    <div style={styles.stepIndicator}>
      {STEPS.map((s, i) => (
        <div
          key={s}
          style={styles.stepDot(s === step, i < stepIndex)}
        />
      ))}
    </div>
  );

  // ---- Step 1: Welcome ----
  const renderWelcome = () => (
    <div style={{ textAlign: 'center' }}>
      <img src={beaconLogo} alt="Beacon" style={styles.logo} />
      <h1 style={styles.heading}>Welcome to Beacon</h1>
      <p style={styles.subtext}>
        Your family command center. Let's get set up in a few quick steps.
      </p>
      <button style={styles.primaryButton} onClick={goNext}>
        Get Started
        <ArrowRight size={18} />
      </button>
    </div>
  );

  // ---- Step 2: Family ----
  const renderFamily = () => (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Users size={28} color="var(--accent)" style={{ marginBottom: 8 }} />
        <h1 style={{ ...styles.heading, fontSize: '1.4rem' }}>Your Family</h1>
        <p style={{ ...styles.subtext, marginBottom: 0 }}>
          Name your family and add members.
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={styles.label}>Family Name</label>
        <input
          type="text"
          placeholder="The Smiths"
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
          style={styles.input}
        />
      </div>

      <label style={styles.label}>Family Members</label>
      {members.map((member, index) => (
        <div key={member._id}>
          <div style={styles.memberRow}>
            <button
              type="button"
              style={{
                ...styles.avatarButton,
                borderColor: member.color,
              }}
              onClick={() =>
                setShowAvatarPicker(showAvatarPicker === index ? null : index)
              }
              title="Choose avatar"
            >
              {member.avatar}
            </button>
            <input
              type="text"
              placeholder={index === 0 ? 'Your name' : 'Family member'}
              value={member.name}
              onChange={(e) => updateMember(index, { name: e.target.value })}
              style={{ ...styles.input, flex: 1 }}
            />
            <select
              value={member.role}
              onChange={(e) =>
                updateMember(index, {
                  role: e.target.value as 'parent' | 'child',
                })
              }
              style={{
                ...styles.input,
                width: 90,
                flex: 'none',
                padding: '10px 8px',
              }}
            >
              <option value="parent">Parent</option>
              <option value="child">Child</option>
            </select>
            {members.length > 1 && (
              <button
                type="button"
                style={styles.removeBtn}
                onClick={() => removeMember(index)}
                title="Remove"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {/* Inline color picker */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 8, paddingLeft: 52 }}>
            {MEMBER_COLORS.slice(0, 10).map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => updateMember(index, { color })}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: color,
                  border:
                    member.color === color
                      ? '2px solid var(--text-primary)'
                      : '2px solid transparent',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
          {/* Avatar picker (shown when this member's avatar button is clicked) */}
          {showAvatarPicker === index && (
            <div style={{ marginBottom: 12, paddingLeft: 52 }}>
              {AVATAR_CATEGORIES.map((cat) => (
                <div key={cat.label}>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      margin: '8px 0 4px',
                    }}
                  >
                    {cat.label}
                  </div>
                  <div style={styles.avatarPicker}>
                    {cat.emojis.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        style={styles.avatarOption(member.avatar === emoji)}
                        onClick={() => {
                          updateMember(index, { avatar: emoji });
                          setShowAvatarPicker(null);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        style={styles.secondaryButton}
        onClick={addMember}
      >
        <Plus size={16} /> Add Family Member
      </button>

      <div style={styles.navRow}>
        <button style={styles.backButton} onClick={goBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <button style={{ ...styles.primaryButton, flex: 1 }} onClick={goNext}>
          Continue <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );

  // ---- Step 3: Weather ----
  const renderWeather = () => (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Cloud size={28} color="var(--accent)" style={{ marginBottom: 8 }} />
        <h1 style={{ ...styles.heading, fontSize: '1.4rem' }}>Weather</h1>
        <p style={{ ...styles.subtext, marginBottom: 0 }}>
          Enter your location to see local weather on your dashboard.
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={styles.label}>Zip Code (US only) or City Name</label>
        <input
          type="text"
          placeholder="e.g. 90210 or Los Angeles"
          value={weatherLocation}
          onChange={(e) => setWeatherLocation(e.target.value)}
          style={styles.input}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={styles.label}>OpenWeatherMap API Key</label>
        <input
          type="text"
          placeholder="Paste your free API key"
          value={owmApiKey}
          onChange={(e) => setOwmApiKey(e.target.value)}
          style={styles.input}
        />
        <div
          style={{
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            marginTop: 8,
            lineHeight: 1.4,
          }}
        >
          Get a free API key at{' '}
          <a
            href="https://home.openweathermap.org/api_keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)' }}
          >
            openweathermap.org
          </a>
          . You can change this later in Settings.
        </div>
      </div>

      <div style={styles.navRow}>
        <button style={styles.backButton} onClick={goBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <button style={{ ...styles.primaryButton, flex: 1 }} onClick={goNext}>
          Continue <ArrowRight size={18} />
        </button>
      </div>
      <button type="button" style={styles.skipLink} onClick={goNext}>
        Skip for now
      </button>
    </div>
  );

  // ---- Step 4: Calendar ----
  const renderCalendar = () => (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Calendar size={28} color="var(--accent)" style={{ marginBottom: 8 }} />
        <h1 style={{ ...styles.heading, fontSize: '1.4rem' }}>Calendar</h1>
        <p style={{ ...styles.subtext, marginBottom: 0 }}>
          Choose how you'd like to manage your calendar.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <div
          style={styles.card(calendarMode === 'local')}
          onClick={() => setCalendarMode('local')}
        >
          <h3 style={styles.cardTitle}>
            <Calendar size={18} color="var(--accent)" />
            Local Calendar
          </h3>
          <p style={styles.cardDesc}>
            Events are stored on this device. No extra setup needed.
          </p>
        </div>

        <div
          style={styles.card(calendarMode === 'ha')}
          onClick={() => setCalendarMode('ha')}
        >
          <h3 style={styles.cardTitle}>
            <Home size={18} color="var(--accent)" />
            Connect Home Assistant
          </h3>
          <p style={styles.cardDesc}>
            Sync calendars, smart home devices, and more with your HA instance.
          </p>
        </div>
      </div>

      {calendarMode === 'ha' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={styles.label}>Home Assistant URL</label>
            <input
              type="url"
              placeholder="https://homeassistant.local:8123"
              value={haUrl}
              onChange={(e) => setHaUrl(e.target.value)}
              style={styles.input}
            />
          </div>
          <div>
            <label style={styles.label}>Long-Lived Access Token</label>
            <input
              type="password"
              placeholder="Paste your token here"
              value={haToken}
              onChange={(e) => setHaToken(e.target.value)}
              style={styles.input}
            />
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                marginTop: 6,
                lineHeight: 1.4,
              }}
            >
              Go to your HA Profile &rarr; Long-lived tokens &rarr; Create
              Token
            </div>
          </div>
        </div>
      )}

      {haValidationError && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--bg-primary)',
            border: '1px solid #e74c3c',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.82rem',
            color: '#e74c3c',
            marginBottom: 12,
          }}
        >
          {haValidationError}
        </div>
      )}

      <div style={styles.navRow}>
        <button style={styles.backButton} onClick={goBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <button
          style={{
            ...styles.primaryButton,
            flex: 1,
            ...(calendarMode === 'ha' && (!haUrl.trim() || !haToken.trim() || haValidating)
              ? styles.primaryButtonDisabled
              : {}),
          }}
          disabled={
            calendarMode === 'ha' && (!haUrl.trim() || !haToken.trim() || haValidating)
          }
          onClick={async () => {
            if (calendarMode === 'ha' && haUrl.trim() && haToken.trim()) {
              setHaValidating(true);
              setHaValidationError(null);
              try {
                const url = haUrl.trim().replace(/\/+$/, '');
                const res = await fetch(`${url}/api/`, {
                  headers: { Authorization: `Bearer ${haToken.trim()}` },
                });
                if (!res.ok) {
                  setHaValidationError(
                    `Could not connect (HTTP ${res.status}). Check the URL and token.`,
                  );
                  return;
                }
                goNext();
              } catch {
                setHaValidationError(
                  'Could not reach that URL. Check the address and try again.',
                );
              } finally {
                setHaValidating(false);
              }
            } else {
              goNext();
            }
          }}
        >
          {haValidating ? 'Validating...' : 'Continue'} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );

  // ---- Step 5: Done ----
  const renderDone = () => {
    const displayName = familyName.trim() || 'My Family';
    const memberNames = members
      .filter((m) => m.name.trim())
      .map((m) => `${m.avatar} ${m.name.trim()}`);

    return (
      <div style={{ textAlign: 'center' }}>
        <Sun size={48} color="var(--accent)" style={{ marginBottom: 16 }} />
        <h1 style={styles.heading}>You're all set!</h1>
        <p style={styles.subtext}>
          Welcome, {displayName}. Here's a quick preview of your setup:
        </p>

        <div
          style={{
            textAlign: 'left',
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-lg)',
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Family
            </span>
            <div
              style={{
                fontSize: '1rem',
                color: 'var(--text-primary)',
                fontWeight: 600,
                marginTop: 4,
              }}
            >
              {displayName}
            </div>
            {memberNames.length > 0 && (
              <div
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                  marginTop: 4,
                }}
              >
                {memberNames.join(', ')}
              </div>
            )}
          </div>

          {weatherLocation.trim() && (
            <div style={{ marginBottom: 12 }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Weather
              </span>
              <div
                style={{
                  fontSize: '0.9rem',
                  color: 'var(--text-primary)',
                  marginTop: 4,
                }}
              >
                {weatherLocation.trim()}
              </div>
            </div>
          )}

          <div>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Calendar
            </span>
            <div
              style={{
                fontSize: '0.9rem',
                color: 'var(--text-primary)',
                marginTop: 4,
              }}
            >
              {calendarMode === 'local'
                ? 'Local calendar'
                : 'Home Assistant'}
            </div>
          </div>
        </div>

        <button style={styles.primaryButton} onClick={handleComplete}>
          Open Beacon
          <Check size={18} />
        </button>

        <button type="button" style={styles.skipLink} onClick={goBack}>
          Go back and make changes
        </button>
      </div>
    );
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        {renderStepIndicator()}
        {step === 'welcome' && renderWelcome()}
        {step === 'family' && renderFamily()}
        {step === 'weather' && renderWeather()}
        {step === 'calendar' && renderCalendar()}
        {step === 'done' && renderDone()}
      </div>
    </div>
  );
}
