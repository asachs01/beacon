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
import {
  FamilyMember,
  MEMBER_COLORS,
  AVATAR_CATEGORIES,
  Routine,
} from '../types/family';
import type { BeaconSettings } from '../hooks/useSettings';
import { getConfig } from '../config';
import { isAddOn } from '../utils/ha-env';
import { buildFocusUrl } from '../focus';
import { useRoutines } from '../hooks/useRoutines';
import { resolveCalendarColor, CALENDAR_COLOR_PRESETS } from '../types';
import { useTranslation, type TranslationKey } from '../i18n';

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
  calendars: Array<{ id: string; name: string; color?: string }>;
  // Kid Display
  onEnterFocusMode: (memberId: string) => void;
}

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

const NAV_ITEMS: Array<{ id: SettingsSection; labelKey: TranslationKey; icon: React.ReactNode }> = [
  { id: 'general', labelKey: 'settings.nav.general', icon: <SettingsIcon size={18} /> },
  { id: 'appearance', labelKey: 'settings.nav.appearance', icon: <Palette size={18} /> },
  { id: 'family', labelKey: 'settings.nav.family', icon: <Users size={18} /> },
  { id: 'calendar', labelKey: 'settings.nav.calendar', icon: <CalendarDays size={18} /> },
  { id: 'integrations', labelKey: 'settings.nav.integrations', icon: <Plug size={18} /> },
  { id: 'display', labelKey: 'settings.nav.display', icon: <Monitor size={18} /> },
  { id: 'chores', labelKey: 'settings.nav.chores', icon: <ListChecks size={18} /> },
  { id: 'about', labelKey: 'settings.nav.about', icon: <Info size={18} /> },
];

// ---------------------------------------------------------------------------
// Reusable sub-components
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="settings-toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
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
  additional_calendar_entities: string[];
}

const EMPTY_FORM: MemberForm = {
  name: '',
  avatar: '🧑',
  color: MEMBER_COLORS[0],
  role: 'child',
  pin: '',
  calendar_entity: '',
  additional_calendar_entities: [],
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
  onEnterFocusMode,
}: SettingsViewProps) {
  const { t } = useTranslation();
  const { setTheme: applyTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState<MemberForm>(EMPTY_FORM);
  const [memberFormMode, setMemberFormMode] = useState<'list' | 'add' | 'edit'>('list');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [kidDisplayMemberId, setKidDisplayMemberId] = useState('');
  const [copiedFocusUrl, setCopiedFocusUrl] = useState(false);
  const [colorEditId, setColorEditId] = useState<string | null>(null);

  // ---- Routine editor state ----
  const routinesApi = useRoutines();
  const [routinesFor, setRoutinesFor] = useState<FamilyMember | null>(null);
  const [routineForm, setRoutineForm] = useState<{
    id: string | null;
    name: string;
    time_of_day: Routine['time_of_day'];
    tasks: { id: string | null; name: string }[];
  } | null>(null);
  const [confirmDeleteRoutine, setConfirmDeleteRoutine] = useState<string | null>(null);

  const genTaskId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const handleSaveRoutine = useCallback(async () => {
    if (!routineForm || !routinesFor) return;
    const name = routineForm.name.trim();
    const tasks = routineForm.tasks
      .map((t) => ({ ...t, name: t.name.trim() }))
      .filter((t) => t.name.length > 0)
      .map((t, i) => ({ id: t.id ?? genTaskId(), name: t.name, order: i }));
    if (!name || tasks.length === 0) return;
    if (routineForm.id) {
      await routinesApi.updateRoutine(routineForm.id, {
        name,
        time_of_day: routineForm.time_of_day,
        tasks,
      });
    } else {
      await routinesApi.addRoutine({
        name,
        member_id: routinesFor.id,
        time_of_day: routineForm.time_of_day,
        tasks,
      });
    }
    setRoutineForm(null);
  }, [routineForm, routinesFor, routinesApi]);

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
      additional_calendar_entities: member.additional_calendar_entities ?? [],
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
      additional_calendar_entities: memberForm.additional_calendar_entities.length > 0
        ? memberForm.additional_calendar_entities
        : undefined,
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
      name: t('settings.appearance.themeAuto'),
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
      <h2 className="settings-section-title">{t('settings.general.title')}</h2>
      <p className="settings-section-desc">{t('settings.general.desc')}</p>

      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('settings.general.familyNameLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.general.familyNameSublabel')}</div>
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
            <div className="settings-row-label">{t('settings.general.defaultViewLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.general.defaultViewSublabel')}</div>
          </div>
          <select
            className="form-select"
            value={settings.defaultView}
            onChange={(e) => onUpdateSettings({ defaultView: e.target.value as BeaconSettings['defaultView'] })}
            style={{ maxWidth: 180 }}
          >
            <option value="dashboard">{t('nav.dashboard')}</option>
            <option value="calendar">{t('nav.calendar')}</option>
            <option value="grocery">{t('nav.grocery')}</option>
            <option value="tasks">{t('nav.tasks')}</option>
            <option value="music">{t('nav.music')}</option>
            <option value="photos">{t('nav.photos')}</option>
          </select>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">{t('settings.general.timeFormatLabel')}</div>
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
          <div className="settings-row-label">{t('settings.general.weekStartsOnLabel')}</div>
          <Segment
            value={String(settings.weekStartsOn) as '0' | '1'}
            options={[
              { value: '0', label: t('settings.general.sunday') },
              { value: '1', label: t('settings.general.monday') },
            ]}
            onChange={(v) => onUpdateSettings({ weekStartsOn: Number(v) as 0 | 1 })}
          />
        </div>
        <div className="settings-row">
          <div className="settings-row-label">{t('settings.general.languageLabel')}</div>
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
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
        </div>
        {isAddOn() && (
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Save Configuration in Browser</div>
              <div className="settings-row-sublabel">
                {getConfig().save_config_in_browser
                  ? 'Keep a local browser copy; Home Assistant remains the shared source.'
                  : 'Disabled by the Home Assistant add-on configuration.'}
              </div>
            </div>
            <Toggle
              checked={settings.saveConfigInBrowser}
              disabled={!getConfig().save_config_in_browser}
              onChange={(v) => onUpdateSettings({ saveConfigInBrowser: v })}
            />
          </div>
        )}
      </div>

      <h2 className="settings-section-title" style={{ marginTop: 32 }}>{t('settings.general.dashboardLayoutTitle')}</h2>
      <p className="settings-section-desc">{t('settings.general.dashboardLayoutDesc')}</p>
      <div className="settings-group">
        <div className="settings-row" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="settings-row-label">{t('settings.general.layoutLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.general.layoutSublabel')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([
              { id: 'default', label: t('settings.general.layoutFamilyLabel'), desc: t('settings.general.layoutFamilyDesc') },
              { id: 'classic', label: t('settings.general.layoutClassicLabel'), desc: t('settings.general.layoutClassicDesc') },
              { id: 'compact', label: t('settings.general.layoutCompactLabel'), desc: t('settings.general.layoutCompactDesc') },
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
      <h2 className="settings-section-title">{t('settings.appearance.title')}</h2>
      <p className="settings-section-desc">{t('settings.appearance.desc')}</p>

      <div className="settings-group">
        <div className="settings-group-title">{t('settings.appearance.themeTitle')}</div>
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
            <div className="settings-row-label">{t('settings.appearance.autoDarkModeLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.appearance.autoDarkModeSublabel')}</div>
          </div>
          <Toggle
            checked={settings.autoDarkMode}
            onChange={(v) => onUpdateSettings({ autoDarkMode: v })}
          />
        </div>
        {settings.autoDarkMode && (
          <>
            <div className="settings-row">
              <div className="settings-row-label">{t('settings.appearance.darkModeStartLabel')}</div>
              <input
                type="time"
                className="settings-time-input"
                value={settings.darkModeStart}
                onChange={(e) => onUpdateSettings({ darkModeStart: e.target.value })}
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-label">{t('settings.appearance.darkModeEndLabel')}</div>
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
            <div className="settings-row-label">{t('settings.appearance.fontSizeLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.appearance.fontSizeSublabel')}</div>
          </div>
          <Segment
            value={settings.fontScale}
            options={[
              { value: 'normal', label: t('settings.appearance.fontNormal') },
              { value: 'large', label: t('settings.appearance.fontLarge') },
              { value: 'extra-large', label: t('settings.appearance.fontXL') },
            ]}
            onChange={(v) => onUpdateSettings({ fontScale: v })}
          />
        </div>
        <div className="settings-row">
          <div className="settings-row-label">{t('settings.appearance.sidebarPositionLabel')}</div>
          <Segment
            value={settings.sidebarPosition}
            options={[
              { value: 'left', label: t('settings.appearance.left') },
              { value: 'right', label: t('settings.appearance.right') },
              { value: 'bottom', label: t('settings.appearance.bottom') },
            ]}
            onChange={(v) => onUpdateSettings({ sidebarPosition: v })}
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('settings.appearance.advancedDashboardLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.appearance.advancedDashboardSublabel')}</div>
          </div>
          <Toggle
            checked={settings.advancedDashboard}
            onChange={(v) => onUpdateSettings({ advancedDashboard: v })}
          />
        </div>
      </div>
    </>
  );

  // ==== FAMILY ====
  const renderFamily = () => {
    if (routinesFor) {
      const memberRoutines = routinesApi.routines.filter((r) => r.member_id === routinesFor.id);
      return (
        <>
          <h2 className="settings-section-title">
            {routinesFor.avatar} {routinesFor.name} {t('settings.family.routinesTitleSuffix')}
          </h2>
          <p className="settings-section-desc">
            {t('settings.family.routinesDesc')}
          </p>
          <div className="settings-group">
            <div style={{ padding: '12px 20px 4px' }}>
              <button
                type="button"
                className="settings-btn"
                onClick={() => {
                  setRoutinesFor(null);
                  setRoutineForm(null);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12 }}
              >
                <ChevronLeft size={16} /> {t('common.back')}
              </button>
            </div>
            {routineForm === null ? (
              <>
                <div className="settings-fm-list">
                  {memberRoutines.length === 0 && (
                    <div className="settings-fm-empty">
                      {t('settings.family.routinesEmpty')}
                    </div>
                  )}
                  {memberRoutines.map((routine) => (
                    <div key={routine.id} className="settings-fm-card">
                      <div className="settings-fm-info">
                        <div className="settings-fm-name">{routine.name}</div>
                        <div className="settings-fm-role">
                          {routine.time_of_day} · {t(
                            routine.tasks.length === 1
                              ? 'settings.family.routineTaskCountSingular'
                              : 'settings.family.routineTaskCountPlural',
                            { n: routine.tasks.length },
                          )}
                        </div>
                      </div>
                      <div className="settings-fm-actions">
                        <button
                          type="button"
                          className="settings-fm-btn"
                          onClick={() =>
                            setRoutineForm({
                              id: routine.id,
                              name: routine.name,
                              time_of_day: routine.time_of_day,
                              tasks: [...routine.tasks]
                                .sort((a, b) => a.order - b.order)
                                .map((t) => ({ id: t.id, name: t.name })),
                            })
                          }
                          aria-label={t('settings.family.editRoutine', { name: routine.name })}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="settings-fm-btn settings-fm-btn--danger"
                          onClick={() => {
                            if (confirmDeleteRoutine === routine.id) {
                              routinesApi.removeRoutine(routine.id);
                              setConfirmDeleteRoutine(null);
                            } else {
                              setConfirmDeleteRoutine(routine.id);
                              setTimeout(() => setConfirmDeleteRoutine(null), 3000);
                            }
                          }}
                          aria-label={t('settings.family.deleteRoutine', { name: routine.name })}
                        >
                          {confirmDeleteRoutine === routine.id ? (
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#ef4444' }}>{t('common.sure')}</span>
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
                    onClick={() =>
                      setRoutineForm({
                        id: null,
                        name: '',
                        time_of_day: 'morning',
                        tasks: [{ id: null, name: '' }],
                      })
                    }
                  >
                    {t('settings.family.addRoutine')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="settings-row">
                  <div className="settings-row-label">{t('settings.family.routineNameLabel')}</div>
                  <input
                    type="text"
                    className="settings-input"
                    value={routineForm.name}
                    onChange={(e) => setRoutineForm((f) => f && { ...f, name: e.target.value })}
                    placeholder={t('settings.family.routineNamePlaceholder')}
                    autoFocus
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-label">{t('settings.family.timeOfDayLabel')}</div>
                  <Segment
                    value={routineForm.time_of_day}
                    options={[
                      { value: 'morning', label: t('settings.family.morning') },
                      { value: 'afternoon', label: t('settings.family.afternoon') },
                      { value: 'evening', label: t('settings.family.evening') },
                    ]}
                    onChange={(v) => setRoutineForm((f) => f && { ...f, time_of_day: v })}
                  />
                </div>
                <div className="settings-row" style={{ alignItems: 'flex-start' }}>
                  <div className="settings-row-label" style={{ paddingTop: 4 }}>{t('settings.family.tasksLabel')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, maxWidth: 340 }}>
                    {routineForm.tasks.map((task, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="text"
                          className="settings-input"
                          value={task.name}
                          placeholder={t('settings.family.taskPlaceholder', { n: i + 1 })}
                          onChange={(e) =>
                            setRoutineForm((f) => {
                              if (!f) return f;
                              const tasks = [...f.tasks];
                              tasks[i] = { ...tasks[i], name: e.target.value };
                              return { ...f, tasks };
                            })
                          }
                        />
                        <button
                          type="button"
                          className="settings-fm-btn"
                          disabled={i === 0}
                          aria-label={t('settings.family.moveUp')}
                          onClick={() =>
                            setRoutineForm((f) => {
                              if (!f || i === 0) return f;
                              const tasks = [...f.tasks];
                              [tasks[i - 1], tasks[i]] = [tasks[i], tasks[i - 1]];
                              return { ...f, tasks };
                            })
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="settings-fm-btn"
                          disabled={i === routineForm.tasks.length - 1}
                          aria-label={t('settings.family.moveDown')}
                          onClick={() =>
                            setRoutineForm((f) => {
                              if (!f || i === f.tasks.length - 1) return f;
                              const tasks = [...f.tasks];
                              [tasks[i], tasks[i + 1]] = [tasks[i + 1], tasks[i]];
                              return { ...f, tasks };
                            })
                          }
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="settings-fm-btn settings-fm-btn--danger"
                          aria-label={t('settings.family.removeTask')}
                          onClick={() =>
                            setRoutineForm((f) => {
                              if (!f) return f;
                              return { ...f, tasks: f.tasks.filter((_, j) => j !== i) };
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="settings-btn"
                      style={{ alignSelf: 'flex-start' }}
                      onClick={() =>
                        setRoutineForm((f) => f && { ...f, tasks: [...f.tasks, { id: null, name: '' }] })
                      }
                    >
                      {t('settings.family.addTask')}
                    </button>
                  </div>
                </div>
                <div style={{ padding: '12px 20px 16px', display: 'flex', gap: 8 }}>
                  <button type="button" className="settings-btn settings-btn--primary" onClick={handleSaveRoutine}>
                    {t('settings.family.saveRoutine')}
                  </button>
                  <button type="button" className="settings-btn" onClick={() => setRoutineForm(null)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      );
    }

    return (
    <>
      <h2 className="settings-section-title">{t('settings.family.title')}</h2>
      <p className="settings-section-desc">{t('settings.family.desc')}</p>

      {memberFormMode === 'list' ? (
        <div className="settings-group">
          <div className="settings-fm-list">
            {members.length === 0 && (
              <div className="settings-fm-empty">
                {t('settings.family.empty')}
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
                  <div className="settings-fm-role">{member.role === 'parent' ? t('settings.family.parent') : t('settings.family.child')}</div>
                </div>
                <div className="settings-fm-actions">
                  <button
                    type="button"
                    className="settings-fm-btn"
                    onClick={() => setRoutinesFor(member)}
                    aria-label={t('settings.family.routinesFor', { name: member.name })}
                  >
                    <ListChecks size={16} />
                  </button>
                  <button
                    type="button"
                    className="settings-fm-btn"
                    onClick={() => handleStartEdit(member)}
                    aria-label={t('settings.family.editMember', { name: member.name })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className={`settings-fm-btn settings-fm-btn--danger`}
                    onClick={() => handleDeleteMember(member.id)}
                    aria-label={t('settings.family.deleteMember', { name: member.name })}
                  >
                    {confirmDelete === member.id ? (
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#ef4444' }}>
                        {t('common.sure')}
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
              {t('settings.family.addMember')}
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
              <ChevronLeft size={16} /> {t('common.back')}
            </button>
          </div>
          <div className="settings-row">
            <div className="settings-row-label">{t('settings.family.nameLabel')}</div>
            <input
              type="text"
              className="settings-input"
              value={memberForm.name}
              onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('settings.family.namePlaceholder')}
              autoFocus
            />
          </div>
          <div className="settings-row">
            <div className="settings-row-label">{t('settings.family.roleLabel')}</div>
            <Segment
              value={memberForm.role}
              options={[
                { value: 'parent', label: t('settings.family.parent') },
                { value: 'child', label: t('settings.family.child') },
              ]}
              onChange={(v) => setMemberForm((f) => ({ ...f, role: v }))}
            />
          </div>
          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <div className="settings-row-label" style={{ paddingTop: 4 }}>{t('settings.family.avatarLabel')}</div>
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
            <div className="settings-row-label" style={{ paddingTop: 4 }}>{t('settings.family.colorLabel')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {MEMBER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`settings-color-circle ${memberForm.color === color ? 'settings-color-circle--selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setMemberForm((f) => ({ ...f, color }))}
                  aria-label={t('settings.family.selectColor', { color })}
                />
              ))}
            </div>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.family.pinLabel')}</div>
              <div className="settings-row-sublabel">{t('settings.family.pinSublabel')}</div>
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
              <div className="settings-row-label">{t('settings.family.calendarLabel')}</div>
              <div className="settings-row-sublabel">{t('settings.family.calendarSublabel')}</div>
            </div>
            <select
              className="settings-select"
              value={memberForm.calendar_entity}
              onChange={(e) => setMemberForm((f) => ({ ...f, calendar_entity: e.target.value }))}
            >
              <option value="">{t('common.none')}</option>
              {calendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.name}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <div>
              <div className="settings-row-label">{t('settings.family.additionalCalendarsLabel')}</div>
              <div className="settings-row-sublabel">
                {t('settings.family.additionalCalendarsSublabel')}
              </div>
            </div>
            {memberForm.additional_calendar_entities.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {memberForm.additional_calendar_entities.map((entityId) => {
                  const cal = calendars.find((c) => c.id === entityId);
                  return (
                    <div
                      key={entityId}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                    >
                      <span className="settings-row-sublabel">{cal?.name ?? entityId}</span>
                      <button
                        type="button"
                        className="settings-btn"
                        onClick={() =>
                          setMemberForm((f) => ({
                            ...f,
                            additional_calendar_entities: f.additional_calendar_entities.filter(
                              (id) => id !== entityId,
                            ),
                          }))
                        }
                      >
                        {t('common.remove')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <select
              className="settings-select"
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                setMemberForm((f) =>
                  f.additional_calendar_entities.includes(id)
                    ? f
                    : { ...f, additional_calendar_entities: [...f.additional_calendar_entities, id] },
                );
              }}
            >
              <option value="">{t('settings.family.addAnotherCalendar')}</option>
              {calendars
                .filter(
                  (cal) =>
                    cal.id !== memberForm.calendar_entity &&
                    !memberForm.additional_calendar_entities.includes(cal.id),
                )
                .map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.name}
                  </option>
                ))}
            </select>
          </div>
          <div style={{ padding: '12px 20px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="settings-btn" onClick={handleCancelMemberForm}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="settings-btn settings-btn--primary"
              onClick={handleSaveMember}
              disabled={!memberForm.name.trim()}
            >
              {memberFormMode === 'edit' ? t('settings.family.saveChanges') : t('settings.family.addMemberBtn')}
            </button>
          </div>
        </div>
      )}
    </>
    );
  };

  // ==== CALENDAR ====
  const renderCalendar = () => (
    <>
      <h2 className="settings-section-title">{t('settings.calendar.title')}</h2>
      <p className="settings-section-desc">{t('settings.calendar.desc')}</p>

      <div className="settings-group">
        <div className="settings-group-title">{t('settings.calendar.connectedCalendarsTitle')}</div>
        {calendars.length === 0 ? (
          <div className="settings-row">
            <div className="settings-row-label" style={{ color: 'var(--text-secondary)' }}>
              {t('settings.calendar.noCalendars')}
            </div>
          </div>
        ) : (
          calendars.map((cal, index) => {
            const isHidden = settings.permanentlyHiddenCalendars.includes(cal.id);
            const customColor = settings.calendarColors[cal.id] || '';
            const resolvedColor = resolveCalendarColor(cal.id, index, {
              calendarColors: settings.calendarColors,
              members,
              defaultColor: cal.color,
            });
            const open = colorEditId === cal.id;

            const setColor = (value: string) => {
              onUpdateSettings({
                calendarColors: { ...settings.calendarColors, [cal.id]: value },
              });
            };
            const resetColor = () => {
              const next = { ...settings.calendarColors };
              delete next[cal.id];
              onUpdateSettings({ calendarColors: next });
            };

            return (
              <div key={cal.id} className="settings-calendar-row">
                <div className="settings-row">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <button
                      type="button"
                      className="settings-calendar-color-swatch"
                      style={{ backgroundColor: resolvedColor }}
                      onClick={() => setColorEditId(open ? null : cal.id)}
                      title={t('settings.calendar.editColor')}
                      aria-label={t('settings.calendar.editColorFor', { name: cal.name })}
                      aria-expanded={open}
                    />
                    <div style={{ minWidth: 0 }}>
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
                {open && (
                  <div className="settings-color-editor">
                    <div className="settings-color-grid">
                      {CALENDAR_COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={`settings-color-circle ${customColor === preset ? 'settings-color-circle--selected' : ''}`}
                          style={{ backgroundColor: preset }}
                          onClick={() => setColor(preset)}
                          aria-label={t('settings.calendar.setColorTo', { name: cal.name, color: preset })}
                        />
                      ))}
                    </div>
                    <div className="settings-color-editor-custom">
                      <label className="settings-color-custom">
                        <input
                          type="color"
                          value={customColor || resolvedColor}
                          onChange={(e) => setColor(e.target.value)}
                          aria-label={t('settings.calendar.chooseCustomColorFor', { name: cal.name })}
                        />
                        <span>{t('common.custom')}</span>
                      </label>
                      <button
                        type="button"
                        className="settings-btn"
                        onClick={resetColor}
                        disabled={!customColor}
                      >
                        {t('settings.calendar.resetToAuto')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">{t('settings.calendar.defaultCalendarLabel')}</div>
          <select
            className="settings-select"
            value={settings.defaultCalendar}
            onChange={(e) => onUpdateSettings({ defaultCalendar: e.target.value })}
          >
            <option value="">{t('common.selectEllipsis')}</option>
            {calendars.map((cal) => (
              <option key={cal.id} value={cal.id}>
                {cal.name}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">{t('settings.calendar.defaultEventDurationLabel')}</div>
          <Segment
            value={String(settings.defaultEventDuration)}
            options={[
              { value: '30', label: t('settings.calendar.min30') },
              { value: '60', label: t('settings.calendar.hr1') },
              { value: '120', label: t('settings.calendar.hr2') },
            ]}
            onChange={(v) => onUpdateSettings({ defaultEventDuration: Number(v) as 30 | 60 | 120 })}
          />
        </div>
        <div className="settings-row">
          <div className="settings-row-label">{t('settings.calendar.notificationTimingLabel')}</div>
          <Segment
            value={String(settings.notificationMinutes)}
            options={[
              { value: '5', label: t('settings.calendar.min5') },
              { value: '10', label: t('settings.calendar.min10') },
              { value: '15', label: t('settings.calendar.min15') },
              { value: '30', label: t('settings.calendar.min30') },
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
      <h2 className="settings-section-title">{t('settings.integrations.title')}</h2>
      <p className="settings-section-desc">{t('settings.integrations.desc')}</p>

      <div className="settings-group">
        <div className="settings-group-title">{t('settings.integrations.homeAssistantTitle')}</div>
        <div className="settings-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className={`settings-status-dot ${connected ? 'settings-status-dot--connected' : 'settings-status-dot--disconnected'}`}
            />
            <div>
              <div className="settings-row-label">{t('settings.integrations.connectionStatusLabel')}</div>
              <div className="settings-row-sublabel">
                {connected ? t('settings.integrations.connected') : t('settings.integrations.disconnected')} &middot; {haUrl}
              </div>
            </div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('settings.integrations.weatherEntityLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.integrations.weatherEntitySublabel')}</div>
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
        <div className="settings-group-title">{t('settings.integrations.grocyTitle')}</div>
        <div className="settings-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className={`settings-status-dot ${settings.grocyEnabled ? 'settings-status-dot--connected' : 'settings-status-dot--disconnected'}`}
            />
            <div>
              <div className="settings-row-label">{t('settings.integrations.grocyLabel')}</div>
              <div className="settings-row-sublabel">{t('settings.integrations.grocySublabel')}</div>
            </div>
          </div>
          <Toggle
            checked={settings.grocyEnabled}
            onChange={(v) => onUpdateSettings({ grocyEnabled: v })}
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">{t('settings.integrations.anylistTitle')}</div>
        <div className="settings-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className={`settings-status-dot ${settings.anylistEnabled ? 'settings-status-dot--connected' : 'settings-status-dot--disconnected'}`}
            />
            <div>
              <div className="settings-row-label">{t('settings.integrations.anylistLabel')}</div>
              <div className="settings-row-sublabel">{t('settings.integrations.anylistSublabel')}</div>
            </div>
          </div>
          <Toggle
            checked={settings.anylistEnabled}
            onChange={(v) => onUpdateSettings({ anylistEnabled: v })}
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">{t('settings.integrations.groceryTitle')}</div>
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
          <div>
            <div className="settings-row-label">{t('settings.integrations.groceryListsLabel')}</div>
            <div className="settings-row-sublabel">
              {t('settings.integrations.groceryListsSublabel')}
            </div>
          </div>
          {todoLists.length === 0 ? (
            <div className="settings-row-sublabel">
              {t('settings.integrations.noTodoListsFound')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {todoLists.map(list => {
                const isChecked = settings.groceryListIds.includes(list.id);
                return (
                  <label
                    key={list.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: isChecked ? 'var(--bg-today)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const newIds = e.target.checked
                          ? [...settings.groceryListIds, list.id]
                          : settings.groceryListIds.filter(id => id !== list.id);
                        onUpdateSettings({ groceryListIds: newIds });
                      }}
                      style={{ width: 16, height: 16 }}
                    />
                    <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {list.name}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('settings.integrations.defaultGroceryListLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.integrations.defaultGroceryListSublabel')}</div>
          </div>
          <select
            className="settings-input"
            value={settings.defaultGroceryList}
            onChange={(e) => onUpdateSettings({ defaultGroceryList: e.target.value })}
          >
            <option value="">{t('settings.integrations.autoFirstAvailable')}</option>
            {todoLists.map(list => (
              <option key={list.id} value={list.id}>{list.name}</option>
            ))}
          </select>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('settings.integrations.shoppingEntityLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.integrations.shoppingEntitySublabel')}</div>
          </div>
          <select
            className="settings-input"
            value={settings.shoppingEntity}
            onChange={(e) => onUpdateSettings({ shoppingEntity: e.target.value })}
          >
            <option value="">{t('common.none')}</option>
            {todoLists.map(list => (
              <option key={list.id} value={list.id}>{list.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">{t('settings.integrations.musicAssistantTitle')}</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('settings.integrations.defaultPlayerLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.integrations.defaultPlayerSublabel')}</div>
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
        <div className="settings-group-title">{t('settings.integrations.photosTitle')}</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('settings.integrations.sourceDirectoryLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.integrations.sourceDirectorySublabel')}</div>
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
            <div className="settings-row-label">{t('settings.integrations.slideshowIntervalLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.integrations.slideshowIntervalSublabel')}</div>
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
          <div className="settings-row-label">{t('settings.integrations.transitionStyleLabel')}</div>
          <Segment
            value={settings.photoTransition}
            options={[
              { value: 'fade', label: t('settings.integrations.fade') },
              { value: 'slide', label: t('settings.integrations.slide') },
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
      <h2 className="settings-section-title">{t('settings.display.title')}</h2>
      <p className="settings-section-desc">{t('settings.display.desc')}</p>

      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('settings.display.screenSaverLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.display.screenSaverSublabel')}</div>
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
                <div className="settings-row-label">{t('settings.display.dimAfterLabel')}</div>
                <div className="settings-row-sublabel">{t('settings.display.dimAfterSublabel')}</div>
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
                <div className="settings-row-label">{t('settings.display.screenSaverAfterLabel')}</div>
                <div className="settings-row-sublabel">{t('settings.display.screenSaverAfterSublabel')}</div>
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
            <div className="settings-row-label">{t('settings.display.alwaysOnLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.display.alwaysOnSublabel')}</div>
          </div>
          <Toggle
            checked={settings.alwaysOnDisplay}
            onChange={(v) => onUpdateSettings({ alwaysOnDisplay: v })}
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('settings.display.showSecondsLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.display.showSecondsSublabel')}</div>
          </div>
          <Toggle
            checked={settings.showSeconds}
            onChange={(v) => onUpdateSettings({ showSeconds: v })}
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('settings.display.kioskModeLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.display.kioskModeSublabel')}</div>
          </div>
          <Toggle
            checked={settings.kioskMode}
            onChange={(v) => onUpdateSettings({ kioskMode: v })}
          />
        </div>
      </div>

      <h2 className="settings-section-title" style={{ marginTop: 32 }}>{t('settings.display.kidDisplayTitle')}</h2>
      <p className="settings-section-desc">
        {t('settings.display.kidDisplayDesc')}
      </p>
      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('settings.display.familyMemberLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.display.familyMemberSublabel')}</div>
          </div>
          <select
            className="settings-select"
            value={kidDisplayMemberId}
            onChange={(e) => {
              setKidDisplayMemberId(e.target.value);
              setCopiedFocusUrl(false);
            }}
          >
            <option value="">{t('settings.display.chooseAMember')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.avatar} {m.name}
              </option>
            ))}
          </select>
        </div>
        {kidDisplayMemberId && (
          <>
            <div className="settings-row">
              <div>
                <div className="settings-row-label">{t('settings.display.useOnDeviceLabel')}</div>
                <div className="settings-row-sublabel">
                  {t('settings.display.useOnDeviceSublabel')}
                </div>
              </div>
              <button
                type="button"
                className="settings-btn settings-btn--primary"
                onClick={() => onEnterFocusMode(kidDisplayMemberId)}
              >
                {t('common.start')}
              </button>
            </div>
            <div className="settings-row">
              <div>
                <div className="settings-row-label">{t('settings.display.displayUrlLabel')}</div>
                <div className="settings-row-sublabel">
                  {t('settings.display.displayUrlSublabel')}
                </div>
              </div>
              <button
                type="button"
                className="settings-btn"
                onClick={() => {
                  const url = buildFocusUrl(kidDisplayMemberId);
                  if (!navigator.clipboard) {
                    window.prompt(t('settings.display.copyUrlPrompt'), url);
                    return;
                  }
                  navigator.clipboard
                    .writeText(url)
                    .then(() => setCopiedFocusUrl(true))
                    .catch(() => {
                      window.prompt(t('settings.display.copyUrlPrompt'), url);
                    });
                }}
              >
                {copiedFocusUrl ? t('settings.display.copied') : t('settings.display.copyUrl')}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );

  // ==== CHORES ====
  const renderChores = () => (
    <>
      <h2 className="settings-section-title">{t('settings.chores.title')}</h2>
      <p className="settings-section-desc">{t('settings.chores.desc')}</p>

      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t('settings.chores.enableLabel')}</div>
            <div className="settings-row-sublabel">{t('settings.chores.enableSublabel')}</div>
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
                <div className="settings-row-label">{t('settings.chores.dailyResetTimeLabel')}</div>
                <div className="settings-row-sublabel">{t('settings.chores.dailyResetTimeSublabel')}</div>
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
                <div className="settings-row-label">{t('settings.chores.streakDurationLabel')}</div>
                <div className="settings-row-sublabel">{t('settings.chores.streakDurationSublabel')}</div>
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
            <div className="settings-group-title">{t('settings.chores.rewardsTitle')}</div>
            <div className="settings-row">
              <div className="settings-row-label">{t('settings.chores.currencySymbolLabel')}</div>
              <Segment
                value={settings.currencySymbol}
                options={[
                  { value: '$', label: '$' },
                  { value: '\u20ac', label: '\u20ac' },
                  { value: '\u00a3', label: '\u00a3' },
                  { value: '\u2b50', label: '\u2b50' },
                ]}
                onChange={(v) => onUpdateSettings({ currencySymbol: v })}
              />
            </div>
            <div className="settings-row">
              <div className="settings-row-label">{t('settings.chores.payoutScheduleLabel')}</div>
              <Segment
                value={settings.payoutSchedule}
                options={[
                  { value: 'weekly', label: t('settings.chores.weekly') },
                  { value: 'monthly', label: t('settings.chores.monthly') },
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
      <h2 className="settings-section-title">{t('settings.about.title')}</h2>
      <p className="settings-section-desc">{t('settings.about.desc')}</p>

      <div className="settings-group">
        <div className="settings-about-row">
          <span className="settings-about-label">{t('settings.about.version')}</span>
          <span className="settings-about-value">{__APP_VERSION__}</span>
        </div>
        <div className="settings-about-row">
          <span className="settings-about-label">{t('settings.about.homeAssistant')}</span>
          <span className="settings-about-value">
            <span
              className={`settings-status-dot ${connected ? 'settings-status-dot--connected' : 'settings-status-dot--disconnected'}`}
              style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }}
            />
            {connected ? t('settings.integrations.connected') : t('settings.integrations.disconnected')}
          </span>
        </div>
        <div className="settings-about-row">
          <span className="settings-about-label">{t('settings.about.haUrl')}</span>
          <span className="settings-about-value">{haUrl}</span>
        </div>
        <div className="settings-about-row">
          <span className="settings-about-label">{t('settings.about.sourceCode')}</span>
          <span className="settings-about-value">
            <a href="https://github.com/asachs01/beacon" target="_blank" rel="noopener noreferrer">
              {t('settings.about.github')}
            </a>
          </span>
        </div>
        <div className="settings-about-row">
          <span className="settings-about-label">{t('settings.about.license')}</span>
          <span className="settings-about-value">MIT</span>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">{t('settings.about.debugTitle')}</div>
        <div style={{ padding: '12px 20px 16px' }}>
          <div className="settings-btn-group">
            <button type="button" className="settings-btn" onClick={handleExport}>
              {t('settings.about.exportSettings')}
            </button>
            <button type="button" className="settings-btn" onClick={handleImport}>
              {t('settings.about.importSettings')}
            </button>
            <button
              type="button"
              className="settings-btn settings-btn--danger"
              onClick={onClearLocalStorage}
            >
              {t('settings.about.clearLocalStorage')}
            </button>
            <button
              type="button"
              className="settings-btn settings-btn--danger"
              onClick={onResetSettings}
            >
              {t('settings.about.resetToDefaults')}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="settings-view">
      <nav className="settings-nav">
        <div className="settings-nav-header">{t('settings.title')}</div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`settings-nav-item ${activeSection === item.id ? 'settings-nav-item--active' : ''}`}
            onClick={() => setActiveSection(item.id)}
          >
            {item.icon}
            {t(item.labelKey)}
          </button>
        ))}
      </nav>
      <div className="settings-content">{renderSection()}</div>
    </div>
  );
}
