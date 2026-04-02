import { useState, useCallback, useEffect } from 'react';
import { useTheme } from '../hooks/useTheme';
import {
  Settings as SettingsIcon,
  Palette,
  Users,
  CalendarDays,
  Plug,
  Monitor,
  ListChecks,
  Info,
  Check,
  Pencil,
  Trash2,
  ChevronLeft,
} from 'lucide-react';
import { AnyListClient } from '../api/anylist';
import { GroceryList } from '../types/grocery';
import { themes } from '../styles/themes';
import { FamilyMember, MEMBER_COLORS, AVATAR_CATEGORIES } from '../types/family';
import type { BeaconSettings } from '../hooks/useSettings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingsSection =
  | 'general'
  | 'appearance'
  | 'family'
  | 'calendar'
  | 'integrations'
  | 'display'
  | 'chores'
  | 'about';

interface SettingsViewProps {
  settings: BeaconSettings;
  onUpdateSettings: (patch: Partial<BeaconSettings>) => void;
  onResetSettings: () => void;
  onExportSettings: () => string;
  onImportSettings: (json: string) => void;
  onClearLocalStorage: () => void;
  // Family
  members: FamilyMember[];
  onAddMember: (member: Omit<FamilyMember, 'id'>) => void;
  onUpdateMember: (id: string, data: Partial<Omit<FamilyMember, 'id'>>) => void;
  onRemoveMember: (id: string) => void;
  // HA connection
  connected: boolean;
  haUrl: string;
  // Calendars
  calendars: Array<{ id: string; name: string }>;
}

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

const NAV_ITEMS: Array<{ id: SettingsSection; label: string; icon: React.ReactNode }> = [
  { id: 'general', label: 'General', icon: <SettingsIcon size={18} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={18} /> },
  { id: 'family', label: 'Family Members', icon: <Users size={18} /> },
  { id: 'calendar', label: 'Calendar', icon: <CalendarDays size={18} /> },
  { id: 'integrations', label: 'Integrations', icon: <Plug size={18} /> },
  { id: 'display', label: 'Display', icon: <Monitor size={18} /> },
  { id: 'chores', label: 'Chores', icon: <ListChecks size={18} /> },
  { id: 'about', label: 'About', icon: <Info size={18} /> },
];

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="settings-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="settings-toggle-track" />
      <span className="settings-toggle-thumb" />
    </label>
  );
}

function Segment<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="settings-segment">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`settings-segment-btn ${value === opt.value ? 'settings-segment-btn--active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="settings-slider-wrapper">
      <input
        type="range"
        className="settings-slider"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="settings-slider-value">
        {value}{unit ?? ''}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Family member edit form (embedded)
// ---------------------------------------------------------------------------

interface MemberForm {
  name: string;
  avatar: string;
  color: string;
  role: 'parent' | 'child';
  pin: string;
  calendar_entity: string;
}

const EMPTY_FORM: MemberForm = {
  name: '',
  avatar: '🧑',
  color: MEMBER_COLORS[0],
  role: 'child',
  pin: '',
  calendar_entity: '',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SettingsView({
  settings,
  onUpdateSettings,
  onResetSettings,
  onExportSettings,
  onImportSettings,
  onClearLocalStorage,
  members,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
  connected,
  haUrl,
  calendars,
}: SettingsViewProps) {
  const { setTheme: applyTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState<MemberForm>(EMPTY_FORM);
  const [memberFormMode, setMemberFormMode] = useState<'list' | 'add' | 'edit'>('list');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ---- Fetch todo lists for grocery default dropdown ----
  const [todoLists, setTodoLists] = useState<GroceryList[]>([]);
  useEffect(() => {
    if (!connected) return;
    const client = new AnyListClient();
    client.getLists().then(setTodoLists).catch(() => {});
  }, [connected]);

  // ---- Family member handlers ----
  const handleStartAdd = useCallback(() => {
    setMemberForm(EMPTY_FORM);
    setEditingMember(null);
    setMemberFormMode('add');
  }, []);

  const handleStartEdit = useCallback((member: FamilyMember) => {
    setMemberForm({
      name: member.name,
      avatar: member.avatar,
      color: member.color,
      role: member.role,
      pin: member.pin ?? '',
      calendar_entity: member.calendar_entity ?? '',
    });
    setEditingMember(member.id);
    setMemberFormMode('edit');
  }, []);

  const handleSaveMember = useCallback(() => {
    if (!memberForm.name.trim()) return;
    const data = {
      name: memberForm.name.trim(),
      avatar: memberForm.avatar,
      color: memberForm.color,
      role: memberForm.role,
      pin: memberForm.pin || undefined,
      calendar_entity: memberForm.calendar_entity || undefined,
    };
    if (memberFormMode === 'edit' && editingMember) {
      onUpdateMember(editingMember, data);
    } else {
      onAddMember(data);
    }
    setMemberFormMode('list');
    setMemberForm(EMPTY_FORM);
    setEditingMember(null);
  }, [memberForm, memberFormMode, editingMember, onAddMember, onUpdateMember]);

  const handleDeleteMember = useCallback(
    (id: string) => {
      if (confirmDelete === id) {
        onRemoveMember(id);
        setConfirmDelete(null);
      } else {
        setConfirmDelete(id);
        setTimeout(() => setConfirmDelete(null), 3000);
      }
    },
    [confirmDelete, onRemoveMember],
  );

  const handleCancelMemberForm = useCallback(() => {
    setMemberFormMode('list');
    setMemberForm(EMPTY_FORM);
    setEditingMember(null);
  }, []);

  // ---- Export/Import ----
  const handleExport = useCallback(() => {
    const json = onExportSettings();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'beacon-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [onExportSettings]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onImportSettings(reader.result);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [onImportSettings]);

  // ---- Theme entries ----
  const themeEntries = [
    {
      id: 'auto',
      name: 'Auto (time-based)',
      colors: ['#faf9f6', '#0f172a', '#3b82f6'],
    },
    ...themes.map((t) => ({
      id: t.id,
      name: t.name,
      colors: [t.colors.background, t.colors.surface, t.colors.accent],
    })),
  ];

  // ---- Render sections ----
  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return renderGeneral();
      case 'appearance':
        return renderAppearance();
      case 'family':
        return renderFamily();
      case 'calendar':
        return renderCalendar();
      case 'integrations':
        return renderIntegrations();
      case 'display':
        return renderDisplay();
      case 'chores':
        return renderChores();
      case 'about':
        return renderAbout();
    }
  };

  // ==== GENERAL ====
  const renderGeneral = () => (
    <>
      <h2 className="settings-section-title">General</h2>
      <p className="settings-section-desc">Basic preferences for your Beacon display.</p>

      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Family Name</div>
            <div className="settings-row-sublabel">Shown in the calendar header</div>
          </div>
          <input
            type="text"
            className="settings-input"
            value={settings.familyName}
            onChange={(e) => onUpdateSettings({ familyName: e.target.value })}
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Default View</div>
            <div className="settings-row-sublabel">Screen shown at startup</div>
          </div>
          <select
            className="form-select"
            value={settings.defaultView}
            onChange={(e) => onUpdateSettings({ defaultView: e.target.value as BeaconSettings['defaultView'] })}
            style={{ maxWidth: 180 }}
          >
            <option value="dashboard">Dashboard</option>
            <option value="calendar">Calendar</option>
            <option value="grocery">Lists</option>
            <option value="tasks">Tasks</option>
            <option value="music">Music</option>
            <option value="photos">Photos</option>
          </select>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">Time Format</div>
          <Segment
            value={settings.timeFormat}
            options={[
              { value: '12h', label: '12h' },
              { value: '24h', label: '24h' },
            ]}
            onChange={(v) => onUpdateSettings({ timeFormat: v })}
          />
        </div>
        <div className="settings-row">
          <div className="settings-row-label">Week Starts On</div>
          <Segment
            value={String(settings.weekStartsOn) as '0' | '1'}
            options={[
              { value: '0', label: 'Sunday' },
              { value: '1', label: 'Monday' },
            ]}
            onChange={(v) => onUpdateSettings({ weekStartsOn: Number(v) as 0 | 1 })}
          />
        </div>
        <div className="settings-row">
          <div className="settings-row-label">Language / Locale</div>
          <select
            className="settings-select"
            value={settings.locale}
            onChange={(e) => onUpdateSettings({ locale: e.target.value })}
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="es">Espa&#241;ol</option>
            <option value="fr">Fran&#231;ais</option>
            <option value="de">Deutsch</option>
            <option value="it">Italiano</option>
            <option value="pt">Portugu&#234;s</option>
            <option value="nl">Nederlands</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
          </select>
        </div>
      </div>

      <h2 className="settings-section-title" style={{ marginTop: 32 }}>Dashboard Layout</h2>
      <p className="settings-section-desc">Choose how your dashboard is organized.</p>
      <div className="settings-group">
        <div className="settings-row" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="settings-row-label">Layout</div>
            <div className="settings-row-sublabel">Pick a preset layout</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([
              { id: 'default', label: 'Family', desc: 'Per-member calendar columns' },
              { id: 'classic', label: 'Classic', desc: 'Original 3-column view' },
              { id: 'compact', label: 'Compact', desc: 'Single column, scrollable' },
            ] as const).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onUpdateSettings({ dashboardLayout: preset.id })}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: settings.dashboardLayout === preset.id
                    ? '2px solid var(--accent)'
                    : '1px solid var(--border)',
                  background: settings.dashboardLayout === preset.id
                    ? 'var(--bg-today)'
                    : 'var(--bg-surface)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  minWidth: 100,
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  {preset.label}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {preset.desc}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  // ==== APPEARANCE ====
  const renderAppearance = () => (
    <>
      <h2 className="settings-section-title">Appearance</h2>
      <p className="settings-section-desc">Customize the look and feel of your display.</p>

      <div className="settings-group">
        <div className="settings-group-title">Theme</div>
        <div className="settings-theme-grid">
          {themeEntries.map((entry) => {
            const isActive = entry.id === settings.themeId;
            return (
              <button
                key={entry.id}
                type="button"
                className={`settings-theme-card ${isActive ? 'settings-theme-card--active' : ''}`}
                onClick={() => { onUpdateSettings({ themeId: entry.id }); applyTheme(entry.id); }}
              >
                <div className="settings-theme-preview">
                  {entry.colors.map((color, i) => (
                    <div
                      key={i}
                      className="settings-theme-swatch"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="settings-theme-name">{entry.name}</div>
                {isActive && (
                  <div className="settings-theme-check">
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Auto Dark Mode</div>
            <div className="settings-row-sublabel">Switch themes based on time of day</div>
          </div>
          <Toggle
            checked={settings.autoDarkMode}
            onChange={(v) => onUpdateSettings({ autoDarkMode: v })}
          />
        </div>
        {settings.autoDarkMode && (
          <>
            <div className="settings-row">
              <div className="settings-row-label">Dark Mode Starts</div>
              <input
                type="time"
                className="settings-time-input"
                value={settings.darkModeStart}
                onChange={(e) => onUpdateSettings({ darkModeStart: e.target.value })}
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-label">Dark Mode Ends</div>
              <input
                type="time"
                className="settings-time-input"
                value={settings.darkModeEnd}
                onChange={(e) => onUpdateSettings({ darkModeEnd: e.target.value })}
              />
            </div>
          </>
        )}
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Font Size</div>
            <div className="settings-row-sublabel">Adjust for viewing distance on wall displays</div>
          </div>
          <Segment
            value={settings.fontScale}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'large', label: 'Large' },
              { value: 'extra-large', label: 'XL' },
            ]}
            onChange={(v) => onUpdateSettings({ fontScale: v })}
          />
        </div>
        <div className="settings-row">
          <div className="settings-row-label">Sidebar Position</div>
          <Segment
            value={settings.sidebarPosition}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
              { value: 'bottom', label: 'Bottom' },
            ]}
            onChange={(v) => onUpdateSettings({ sidebarPosition: v })}
          />
        </div>
      </div>
    </>
  );

  // ==== FAMILY ====
  const renderFamily = () => (
    <>
      <h2 className="settings-section-title">Family Members</h2>
      <p className="settings-section-desc">Manage who appears on your family display.</p>

      {memberFormMode === 'list' ? (
        <div className="settings-group">
          <div className="settings-fm-list">
            {members.length === 0 && (
              <div className="settings-fm-empty">
                No family members yet. Add someone to get started.
              </div>
            )}
            {members.map((member) => (
              <div key={member.id} className="settings-fm-card">
                <div
                  className="settings-fm-avatar"
                  style={{
                    backgroundColor: member.color + '22',
                    border: `2px solid ${member.color}`,
                  }}
                >
                  {member.avatar}
                </div>
                <div className="settings-fm-info">
                  <div className="settings-fm-name">{member.name}</div>
                  <div className="settings-fm-role">{member.role}</div>
                </div>
                <div className="settings-fm-actions">
                  <button
                    type="button"
                    className="settings-fm-btn"
                    onClick={() => handleStartEdit(member)}
                    aria-label={`Edit ${member.name}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className={`settings-fm-btn settings-fm-btn--danger`}
                    onClick={() => handleDeleteMember(member.id)}
                    aria-label={`Delete ${member.name}`}
                  >
                    {confirmDelete === member.id ? (
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#ef4444' }}>
                        Sure?
                      </span>
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '8px 20px 16px' }}>
            <button
              type="button"
              className="settings-btn settings-btn--primary"
              onClick={handleStartAdd}
            >
              + Add Member
            </button>
          </div>
        </div>
      ) : (
        <div className="settings-group">
          <div style={{ padding: '12px 20px 4px' }}>
            <button
              type="button"
              className="settings-btn"
              onClick={handleCancelMemberForm}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12 }}
            >
              <ChevronLeft size={16} /> Back
            </button>
          </div>
          <div className="settings-row">
            <div className="settings-row-label">Name</div>
            <input
              type="text"
              className="settings-input"
              value={memberForm.name}
              onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Family member name"
              autoFocus
            />
          </div>
          <div className="settings-row">
            <div className="settings-row-label">Role</div>
            <Segment
              value={memberForm.role}
              options={[
                { value: 'parent', label: 'Parent' },
                { value: 'child', label: 'Child' },
              ]}
              onChange={(v) => setMemberForm((f) => ({ ...f, role: v }))}
            />
          </div>
          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <div className="settings-row-label" style={{ paddingTop: 4 }}>Avatar</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 300 }}>
              {AVATAR_CATEGORIES.flatMap((cat) => cat.emojis).map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: memberForm.avatar === emoji ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: memberForm.avatar === emoji ? 'var(--bg-today)' : 'none',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                  onClick={() => setMemberForm((f) => ({ ...f, avatar: emoji }))}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <div className="settings-row-label" style={{ paddingTop: 4 }}>Color</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {MEMBER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`settings-color-circle ${memberForm.color === color ? 'settings-color-circle--selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setMemberForm((f) => ({ ...f, color }))}
                  aria-label={`Select color ${color}`}
                />
              ))}
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">PIN</div>
              <div className="settings-row-sublabel">Optional, 4-6 digits</div>
            </div>
            <input
              type="password"
              className="settings-input"
              style={{ width: 120 }}
              value={memberForm.pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setMemberForm((f) => ({ ...f, pin: val }));
              }}
              placeholder="****"
              inputMode="numeric"
              maxLength={6}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Calendar</div>
              <div className="settings-row-sublabel">Link to their HA calendar</div>
            </div>
            <select
              className="settings-select"
              value={memberForm.calendar_entity}
              onChange={(e) => setMemberForm((f) => ({ ...f, calendar_entity: e.target.value }))}
            >
              <option value="">None</option>
              {calendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ padding: '12px 20px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="settings-btn" onClick={handleCancelMemberForm}>
              Cancel
            </button>
            <button
              type="button"
              className="settings-btn settings-btn--primary"
              onClick={handleSaveMember}
              disabled={!memberForm.name.trim()}
            >
              {memberFormMode === 'edit' ? 'Save Changes' : 'Add Member'}
            </button>
          </div>
        </div>
      )}
    </>
  );

  // ==== CALENDAR ====
  const renderCalendar = () => (
    <>
      <h2 className="settings-section-title">Calendar</h2>
      <p className="settings-section-desc">Configure calendar display and defaults.</p>

      <div className="settings-group">
        <div className="settings-group-title">Connected Calendars</div>
        {calendars.length === 0 ? (
          <div className="settings-row">
            <div className="settings-row-label" style={{ color: 'var(--text-secondary)' }}>
              No calendars found. Connect Home Assistant to see calendars.
            </div>
          </div>
        ) : (
          calendars.map((cal) => {
            const isHidden = settings.permanentlyHiddenCalendars.includes(cal.id);
            const color = settings.calendarColors[cal.id] || '';
            return (
              <div key={cal.id} className="settings-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                  <input
                    type="color"
                    value={color || '#3b82f6'}
                    onChange={(e) => {
                      onUpdateSettings({
                        calendarColors: { ...settings.calendarColors, [cal.id]: e.target.value },
                      });
                    }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    title="Calendar color"
                  />
                  <div>
                    <div className="settings-row-label">{cal.name}</div>
                    <div className="settings-row-sublabel">{cal.id}</div>
                  </div>
                </div>
                <Toggle
                  checked={!isHidden}
                  onChange={(visible) => {
                    const hidden = settings.permanentlyHiddenCalendars.filter(
                      (id) => id !== cal.id,
                    );
                    if (!visible) hidden.push(cal.id);
                    onUpdateSettings({ permanentlyHiddenCalendars: hidden });
                  }}
                />
              </div>
            );
          })
        )}
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">Default Calendar</div>
          <select
            className="settings-select"
            value={settings.defaultCalendar}
            onChange={(e) => onUpdateSettings({ defaultCalendar: e.target.value })}
          >
            <option value="">Select...</option>
            {calendars.map((cal) => (
              <option key={cal.id} value={cal.id}>
                {cal.name}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">Default Event Duration</div>
          <Segment
            value={String(settings.defaultEventDuration)}
            options={[
              { value: '30', label: '30 min' },
              { value: '60', label: '1 hr' },
              { value: '120', label: '2 hr' },
            ]}
            onChange={(v) => onUpdateSettings({ defaultEventDuration: Number(v) as 30 | 60 | 120 })}
          />
        </div>
        <div className="settings-row">
          <div className="settings-row-label">Notification Timing</div>
          <Segment
            value={String(settings.notificationMinutes)}
            options={[
              { value: '5', label: '5 min' },
              { value: '10', label: '10 min' },
              { value: '15', label: '15 min' },
              { value: '30', label: '30 min' },
            ]}
            onChange={(v) => onUpdateSettings({ notificationMinutes: Number(v) as 5 | 10 | 15 | 30 })}
          />
        </div>
      </div>
    </>
  );

  // ==== INTEGRATIONS ====
  const renderIntegrations = () => (
    <>
      <h2 className="settings-section-title">Integrations</h2>
      <p className="settings-section-desc">Manage connections to Home Assistant and other services.</p>

      <div className="settings-group">
        <div className="settings-group-title">Home Assistant</div>
        <div className="settings-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className={`settings-status-dot ${connected ? 'settings-status-dot--connected' : 'settings-status-dot--disconnected'}`}
            />
            <div>
              <div className="settings-row-label">Connection Status</div>
              <div className="settings-row-sublabel">
                {connected ? 'Connected' : 'Disconnected'} &middot; {haUrl}
              </div>
            </div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Weather Entity</div>
            <div className="settings-row-sublabel">Entity used for weather display</div>
          </div>
          <input
            type="text"
            className="settings-input"
            value={settings.weatherEntity}
            onChange={(e) => onUpdateSettings({ weatherEntity: e.target.value })}
            placeholder="weather.home"
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Grocy</div>
        <div className="settings-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className={`settings-status-dot ${settings.grocyEnabled ? 'settings-status-dot--connected' : 'settings-status-dot--disconnected'}`}
            />
            <div>
              <div className="settings-row-label">Grocy Integration</div>
              <div className="settings-row-sublabel">Grocery and meal planning</div>
            </div>
          </div>
          <Toggle
            checked={settings.grocyEnabled}
            onChange={(v) => onUpdateSettings({ grocyEnabled: v })}
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">AnyList</div>
        <div className="settings-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className={`settings-status-dot ${settings.anylistEnabled ? 'settings-status-dot--connected' : 'settings-status-dot--disconnected'}`}
            />
            <div>
              <div className="settings-row-label">AnyList Integration</div>
              <div className="settings-row-sublabel">Shared shopping lists</div>
            </div>
          </div>
          <Toggle
            checked={settings.anylistEnabled}
            onChange={(v) => onUpdateSettings({ anylistEnabled: v })}
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Grocery</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Default Grocery List</div>
            <div className="settings-row-sublabel">List shown when opening grocery view</div>
          </div>
          <select
            className="settings-input"
            value={settings.defaultGroceryList}
            onChange={(e) => onUpdateSettings({ defaultGroceryList: e.target.value })}
          >
            <option value="">Auto (first available)</option>
            {todoLists.map(list => (
              <option key={list.id} value={list.id}>{list.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Music Assistant</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Default Player</div>
            <div className="settings-row-sublabel">Media player used by default</div>
          </div>
          <input
            type="text"
            className="settings-input"
            value={settings.musicDefaultPlayer}
            onChange={(e) => onUpdateSettings({ musicDefaultPlayer: e.target.value })}
            placeholder="media_player.living_room"
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Photos</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Source Directory</div>
            <div className="settings-row-sublabel">Path to photo directory on HA</div>
          </div>
          <input
            type="text"
            className="settings-input settings-input--wide"
            value={settings.photoDirectory}
            onChange={(e) => onUpdateSettings({ photoDirectory: e.target.value })}
            placeholder="/media/beacon/photos"
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Slideshow Interval</div>
            <div className="settings-row-sublabel">Seconds between photo changes</div>
          </div>
          <Slider
            value={settings.photoInterval}
            min={10}
            max={120}
            step={5}
            unit="s"
            onChange={(v) => onUpdateSettings({ photoInterval: v })}
          />
        </div>
        <div className="settings-row">
          <div className="settings-row-label">Transition Style</div>
          <Segment
            value={settings.photoTransition}
            options={[
              { value: 'fade', label: 'Fade' },
              { value: 'slide', label: 'Slide' },
            ]}
            onChange={(v) => onUpdateSettings({ photoTransition: v })}
          />
        </div>
      </div>
    </>
  );

  // ==== DISPLAY ====
  const renderDisplay = () => (
    <>
      <h2 className="settings-section-title">Display</h2>
      <p className="settings-section-desc">Screen saver, brightness, and kiosk settings.</p>

      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Screen Saver</div>
            <div className="settings-row-sublabel">Shows a floating clock after idle</div>
          </div>
          <Toggle
            checked={settings.screenSaverEnabled}
            onChange={(v) => onUpdateSettings({ screenSaverEnabled: v })}
          />
        </div>
        {settings.screenSaverEnabled && (
          <>
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Dim After</div>
                <div className="settings-row-sublabel">Minutes of inactivity before dimming</div>
              </div>
              <Slider
                value={settings.dimTimeout}
                min={1}
                max={30}
                unit=" min"
                onChange={(v) => onUpdateSettings({ dimTimeout: v })}
              />
            </div>
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Screen Saver After</div>
                <div className="settings-row-sublabel">Minutes before screen saver activates</div>
              </div>
              <Slider
                value={settings.screenSaverTimeout}
                min={5}
                max={60}
                step={5}
                unit=" min"
                onChange={(v) => onUpdateSettings({ screenSaverTimeout: v })}
              />
            </div>
          </>
        )}
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Always-On Display</div>
            <div className="settings-row-sublabel">Prevent screen from sleeping</div>
          </div>
          <Toggle
            checked={settings.alwaysOnDisplay}
            onChange={(v) => onUpdateSettings({ alwaysOnDisplay: v })}
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Show Seconds on Clock</div>
            <div className="settings-row-sublabel">Display seconds in the header clock</div>
          </div>
          <Toggle
            checked={settings.showSeconds}
            onChange={(v) => onUpdateSettings({ showSeconds: v })}
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Kiosk Mode</div>
            <div className="settings-row-sublabel">Hide the sidebar for a cleaner display</div>
          </div>
          <Toggle
            checked={settings.kioskMode}
            onChange={(v) => onUpdateSettings({ kioskMode: v })}
          />
        </div>
      </div>
    </>
  );

  // ==== CHORES ====
  const renderChores = () => (
    <>
      <h2 className="settings-section-title">Chores</h2>
      <p className="settings-section-desc">Manage chore tracking and reward settings.</p>

      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Enable Chores</div>
            <div className="settings-row-sublabel">Show chore tracking and rewards</div>
          </div>
          <Toggle
            checked={settings.choresEnabled}
            onChange={(v) => onUpdateSettings({ choresEnabled: v })}
          />
        </div>
      </div>

      {settings.choresEnabled && (
        <>
          <div className="settings-group">
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Daily Reset Time</div>
                <div className="settings-row-sublabel">When daily chores reset</div>
              </div>
              <input
                type="time"
                className="settings-time-input"
                value={settings.choresResetTime}
                onChange={(e) => onUpdateSettings({ choresResetTime: e.target.value })}
              />
            </div>
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Streak Duration</div>
                <div className="settings-row-sublabel">Days needed to maintain a streak</div>
              </div>
              <Slider
                value={settings.streakDays}
                min={3}
                max={30}
                unit=" days"
                onChange={(v) => onUpdateSettings({ streakDays: v })}
              />
            </div>
          </div>

          <div className="settings-group">
            <div className="settings-group-title">Rewards</div>
            <div className="settings-row">
              <div className="settings-row-label">Currency Symbol</div>
              <Segment
                value={settings.currencySymbol}
                options={[
                  { value: '$', label: '$' },
                  { value: '\u20ac', label: '\u20ac' },
                  { value: '\u00a3', label: '\u00a3' },
                ]}
                onChange={(v) => onUpdateSettings({ currencySymbol: v })}
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-label">Payout Schedule</div>
              <Segment
                value={settings.payoutSchedule}
                options={[
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'monthly', label: 'Monthly' },
                ]}
                onChange={(v) => onUpdateSettings({ payoutSchedule: v })}
              />
            </div>
          </div>
        </>
      )}
    </>
  );

  // ==== ABOUT ====
  const renderAbout = () => (
    <>
      <h2 className="settings-section-title">About</h2>
      <p className="settings-section-desc">Version info, debug tools, and links.</p>

      <div className="settings-group">
        <div className="settings-about-row">
          <span className="settings-about-label">Version</span>
          <span className="settings-about-value">1.0.0</span>
        </div>
        <div className="settings-about-row">
          <span className="settings-about-label">Home Assistant</span>
          <span className="settings-about-value">
            <span
              className={`settings-status-dot ${connected ? 'settings-status-dot--connected' : 'settings-status-dot--disconnected'}`}
              style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }}
            />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="settings-about-row">
          <span className="settings-about-label">HA URL</span>
          <span className="settings-about-value">{haUrl}</span>
        </div>
        <div className="settings-about-row">
          <span className="settings-about-label">Source Code</span>
          <span className="settings-about-value">
            <a href="https://github.com/asachs01/beacon" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </span>
        </div>
        <div className="settings-about-row">
          <span className="settings-about-label">License</span>
          <span className="settings-about-value">MIT</span>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Debug</div>
        <div style={{ padding: '12px 20px 16px' }}>
          <div className="settings-btn-group">
            <button type="button" className="settings-btn" onClick={handleExport}>
              Export Settings
            </button>
            <button type="button" className="settings-btn" onClick={handleImport}>
              Import Settings
            </button>
            <button
              type="button"
              className="settings-btn settings-btn--danger"
              onClick={onClearLocalStorage}
            >
              Clear localStorage
            </button>
            <button
              type="button"
              className="settings-btn settings-btn--danger"
              onClick={onResetSettings}
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="settings-view">
      <nav className="settings-nav">
        <div className="settings-nav-header">Settings</div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`settings-nav-item ${activeSection === item.id ? 'settings-nav-item--active' : ''}`}
            onClick={() => setActiveSection(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
      <div className="settings-content">{renderSection()}</div>
    </div>
  );
}
