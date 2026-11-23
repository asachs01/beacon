import { useEffect, useMemo, useState } from 'react';
import { AnyListClient } from '../api/anylist';
import { GrocyClient } from '../api/grocy';
import { hasToken } from '../api/ha-rest';
import type { HomeAssistantClient } from '../api/homeassistant';
import { calendarWriteFromDraft, pickCalendarId, pickListId, type ListTarget } from '../import/commit';
import { extractMagicImport, planMagicImport, type Extraction } from '../import/extract';
import type { NamedAgent } from '../import/agent';
import { conversationDeps } from '../import/ha';
import { householdTimeZone } from '../import/calendar';
import { importPinDecision } from '../import/pin-gate';
import { useLocalTasks } from '../hooks/useLocalTasks';
import { useTranslation, type TranslationKey } from '../i18n';

interface CalendarTarget {
  id: string;
  name: string;
}

interface MagicImportModalProps {
  calendars: CalendarTarget[];
  members: readonly { pin?: string | null }[];
  defaultCalendarId: string;
  defaultGroceryListId: string;
  defaultTodoListId: string;
  defaultDurationMinutes: number;
  locale: string;
  grocyEnabled: boolean;
  /** Off forces the local parser. Defaults to asking Home Assistant. */
  useHaAgent?: boolean;
  getClient: () => HomeAssistantClient | null;
  onCreateEvent: (calendarId: string, event: {
    summary: string;
    start_date_time?: string;
    end_date_time?: string;
    start_date?: string;
    end_date?: string;
    description?: string;
    location?: string;
  }) => Promise<void> | void;
  onClose: () => void;
  onCommitted?: () => void;
  /** Tests pass known lists and a fixed extraction. The screen discovers both otherwise. */
  lists?: ListTarget[];
  extract?: (text: string) => Promise<Extraction>;
  /** Tests supply the reader the paste screen should name. */
  planRoute?: () => Promise<Pick<Extraction, 'source' | 'agent'>>;
  onAddListItem?: (listId: string, title: string) => Promise<void> | void;
  now?: Date;
  timeZone?: string;
}

interface EventDraft {
  id: string;
  kind: 'event';
  title: string;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  calendarId: string;
}

interface ListDraft {
  id: string;
  kind: 'list';
  title: string;
  listId: string;
}

type Draft = EventDraft | ListDraft;

function readerKey(
  route: Pick<Extraction, 'source' | 'agent'>,
  done: boolean,
): TranslationKey {
  const agent = route.agent;
  if (route.source !== 'home-assistant' || !agent) {
    return done ? 'import.pathLocalDone' : 'import.pathLocal';
  }
  if (!agent.id) return done ? 'import.pathHaUnnamedDone' : 'import.pathHaUnnamed';
  if (agent.locality === 'local') return done ? 'import.pathHaLocalDone' : 'import.pathHaLocal';
  if (agent.locality === 'cloud') return done ? 'import.pathHaCloudDone' : 'import.pathHaCloud';
  return done ? 'import.pathHaMaybeDone' : 'import.pathHaMaybe';
}

function buildDrafts(
  result: Extraction,
  calendars: CalendarTarget[],
  lists: ListTarget[],
  defaults: { calendarId: string; groceryListId: string; todoListId: string },
): Draft[] {
  const calendarId = pickCalendarId(calendars, defaults.calendarId);
  let n = 0;
  const events: EventDraft[] = result.events.map((event) => ({
    id: `draft-${n++}`,
    kind: 'event',
    title: event.title,
    date: event.date,
    allDay: event.allDay,
    startTime: event.startTime ?? '',
    endTime: event.endTime ?? '',
    location: event.location ?? '',
    notes: event.notes ?? '',
    calendarId,
  }));
  const items: ListDraft[] = result.items.map((item) => ({
    id: `draft-${n++}`,
    kind: 'list',
    title: item.title,
    listId: pickListId(
      lists,
      item.list === 'grocery' ? defaults.groceryListId : defaults.todoListId,
      item.list,
    ),
  }));
  return [...events, ...items];
}

export function MagicImportModal({
  calendars,
  members,
  defaultCalendarId,
  defaultGroceryListId,
  defaultTodoListId,
  defaultDurationMinutes,
  locale,
  grocyEnabled,
  useHaAgent = true,
  getClient,
  onCreateEvent,
  onClose,
  onCommitted,
  lists: listsProp,
  extract,
  planRoute,
  onAddListItem,
  now,
  timeZone,
}: MagicImportModalProps) {
  const { t } = useTranslation();
  const localTasks = useLocalTasks();
  const [haLists, setHaLists] = useState<ListTarget[]>([]);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'paste' | 'review'>('paste');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [planned, setPlanned] = useState<Pick<Extraction, 'source' | 'agent'> | null>(null);
  const [source, setSource] = useState<Extraction['source']>('local');
  const [agent, setAgent] = useState<NamedAgent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pinOpen, setPinOpen] = useState<'approve' | 'reject' | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const route = planRoute
          ? await planRoute()
          : await planMagicImport(conversationDeps(getClient, useHaAgent));
        if (!cancelled) setPlanned(route);
      } catch {
        if (!cancelled) setPlanned({ source: 'local', agent: null });
      }
    })();
    return () => { cancelled = true; };
  }, [getClient, planRoute, useHaAgent]);

  useEffect(() => {
    if (listsProp) return undefined;
    let cancelled = false;
    (async () => {
      if (!hasToken()) return;
      try {
        const found = await new AnyListClient().getLists();
        if (!cancelled) setHaLists(found.map((list) => ({ id: list.id, name: list.name })));
      } catch {
        /* local lists still work */
      }
    })();
    return () => { cancelled = true; };
  }, [listsProp]);

  const lists = useMemo<ListTarget[]>(() => {
    if (listsProp) return listsProp;
    const local = localTasks.lists.map((list) => ({ id: list.id, name: list.name }));
    const grocy = grocyEnabled ? [{ id: 'grocy', name: 'Grocy' }] : [];
    const seen = new Set<string>();
    return [...local, ...haLists, ...grocy].filter((list) => {
      if (seen.has(list.id)) return false;
      seen.add(list.id);
      return true;
    });
  }, [listsProp, localTasks.lists, haLists, grocyEnabled]);

  const update = (id: string, patch: Record<string, string | boolean>) => {
    setDrafts((prev) => prev.map((draft) => (draft.id === id ? { ...draft, ...patch } as Draft : draft)));
  };

  const extractText = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError('');
    try {
      const ctx = {
        now: now ?? new Date(),
        timeZone: timeZone ?? householdTimeZone(),
        locale,
      };
      const result = extract
        ? await extract(trimmed)
        : await extractMagicImport(trimmed, ctx, conversationDeps(getClient, useHaAgent));
      setSource(result.source);
      setAgent(result.agent);
      setDrafts(buildDrafts(result, calendars, lists, {
        calendarId: defaultCalendarId,
        groceryListId: defaultGroceryListId,
        todoListId: defaultTodoListId,
      }));
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('import.saveError'));
    } finally {
      setBusy(false);
    }
  };

  const addListItem = async (listId: string, title: string) => {
    if (onAddListItem) {
      await onAddListItem(listId, title);
      return;
    }
    if (listId === 'grocy') {
      await new GrocyClient().addItem(title);
      return;
    }
    if (listId.startsWith('todo.')) {
      await new AnyListClient().addItem(listId, title);
      return;
    }
    localTasks.addTask(listId, title);
  };

  const commit = async () => {
    setBusy(true);
    setError('');
    const failed: Draft[] = [];
    for (const draft of drafts) {
      try {
        if (!draft.title.trim()) throw new Error('blank');
        if (draft.kind === 'event') {
          if (!draft.calendarId) throw new Error('no calendar');
          const payload = calendarWriteFromDraft(draft, defaultDurationMinutes);
          if (!payload) throw new Error('invalid event');
          await onCreateEvent(draft.calendarId, payload);
        } else {
          if (!draft.listId) throw new Error('no list');
          await addListItem(draft.listId, draft.title.trim());
        }
      } catch {
        failed.push(draft);
      }
    }
    setBusy(false);
    if (failed.length > 0) {
      setDrafts(failed);
      setError(t('import.saveError'));
      return;
    }
    onCommitted?.();
    onClose();
  };

  const request = (action: 'approve' | 'reject') => {
    if (busy) return;
    if (action === 'approve' && drafts.length === 0) return;
    if (importPinDecision(members, '') === 'not-required') {
      if (action === 'approve') void commit();
      else onClose();
      return;
    }
    setPin('');
    setPinError(false);
    setPinOpen(action);
  };

  const submitPin = (value: string) => {
    if (importPinDecision(members, value) !== 'accepted') {
      setPin('');
      setPinError(true);
      return;
    }
    const action = pinOpen;
    setPinOpen(null);
    setPin('');
    if (action === 'approve') void commit();
    else onClose();
  };

  const dismiss = () => {
    if (pinOpen || busy) return;
    if (phase === 'review') request('reject');
    else onClose();
  };

  return (
    <div className="modal-overlay" onClick={dismiss}>
      <div
        className="modal magic-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="magic-import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="magic-import-title" className="modal-title">{t('import.title')}</h2>
          <button type="button" className="modal-close" onClick={dismiss} aria-label={t('common.close')}>×</button>
        </div>
        <div className="modal-body">
          {phase === 'paste' ? (
            <>
              <label className="magic-import-label" htmlFor="magic-import-text">{t('import.pasteLabel')}</label>
              <p className="magic-import-hint">{t('import.pasteHint')}</p>
              {planned && (
                <p className="magic-import-hint">
                  {t(readerKey(planned, false), {
                    name: planned.agent?.name ?? '',
                    id: planned.agent?.id ?? '',
                  })}
                </p>
              )}
              {planned?.source === 'home-assistant' && (
                <p className="magic-import-privacy">{t('import.privacy')}</p>
              )}
              <textarea
                id="magic-import-text"
                className="settings-input magic-import-text"
                rows={8}
                value={text}
                placeholder={t('import.placeholder')}
                onChange={(event) => setText(event.target.value)}
              />
            </>
          ) : (
            <>
              <p className="magic-import-hint">
                {t(readerKey({ source, agent }, true), {
                  name: agent?.name ?? '',
                  id: agent?.id ?? '',
                })}
              </p>
              {source === 'home-assistant' && (
                <p className="magic-import-privacy">{t('import.privacy')}</p>
              )}
              {drafts.length === 0 ? (
                <p>{t('import.empty')}</p>
              ) : (
                <ul className="magic-import-list">
                  {drafts.map((draft) => (
                    <li key={draft.id} className="magic-import-draft">
                      <div className="magic-import-draft-head">
                        <span className="magic-import-kind">
                          {draft.kind === 'event' ? t('import.kindEvent') : t('import.kindList')}
                        </span>
                        <button
                          type="button"
                          className="settings-btn"
                          onClick={() => setDrafts((prev) => prev.filter((item) => item.id !== draft.id))}
                        >
                          {t('import.removeDraft')}
                        </button>
                      </div>
                      <label className="magic-import-label">
                        {t('import.fieldTitle')}
                        <input
                          className="settings-input"
                          value={draft.title}
                          onChange={(event) => update(draft.id, { title: event.target.value })}
                        />
                      </label>
                      {draft.kind === 'event' ? (
                        <>
                          <label className="magic-import-check">
                            <input
                              type="checkbox"
                              checked={draft.allDay}
                              onChange={(event) => update(draft.id, { allDay: event.target.checked })}
                            />
                            {t('common.allDay')}
                          </label>
                          <label className="magic-import-label">
                            {t('import.fieldDate')}
                            <input
                              className="settings-input"
                              type="date"
                              value={draft.date}
                              onChange={(event) => update(draft.id, { date: event.target.value })}
                            />
                          </label>
                          {!draft.allDay && (
                            <div className="magic-import-times">
                              <label className="magic-import-label">
                                {t('import.fieldStart')}
                                <input
                                  className="settings-input"
                                  type="time"
                                  value={draft.startTime}
                                  onChange={(event) => update(draft.id, { startTime: event.target.value })}
                                />
                              </label>
                              <label className="magic-import-label">
                                {t('import.fieldEnd')}
                                <input
                                  className="settings-input"
                                  type="time"
                                  value={draft.endTime}
                                  onChange={(event) => update(draft.id, { endTime: event.target.value })}
                                />
                              </label>
                            </div>
                          )}
                          <label className="magic-import-label">
                            {t('import.fieldLocation')}
                            <input
                              className="settings-input"
                              value={draft.location}
                              onChange={(event) => update(draft.id, { location: event.target.value })}
                            />
                          </label>
                          <label className="magic-import-label">
                            {t('import.fieldNotes')}
                            <input
                              className="settings-input"
                              value={draft.notes}
                              onChange={(event) => update(draft.id, { notes: event.target.value })}
                            />
                          </label>
                          <label className="magic-import-label">
                            {t('import.fieldCalendar')}
                            <select
                              className="settings-select"
                              value={draft.calendarId}
                              onChange={(event) => update(draft.id, { calendarId: event.target.value })}
                            >
                              {calendars.map((calendar) => (
                                <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : (
                        <label className="magic-import-label">
                          {t('import.fieldList')}
                          <select
                            className="settings-select"
                            value={draft.listId}
                            onChange={(event) => update(draft.id, { listId: event.target.value })}
                          >
                            {lists.map((list) => (
                              <option key={list.id} value={list.id}>{list.name}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {error && <p className="modal-error" role="alert">{error}</p>}
        </div>
        <div className="modal-footer">
          {phase === 'review' && (
            <button type="button" className="settings-btn" onClick={() => setPhase('paste')} disabled={busy}>
              {t('import.back')}
            </button>
          )}
          <div className="modal-footer-right">
            {phase === 'paste' ? (
              <button type="button" className="settings-btn settings-btn--primary" onClick={() => { void extractText(); }} disabled={busy || !text.trim()}>
                {busy ? t('import.extracting') : t('import.extract')}
              </button>
            ) : (
              <>
                <button type="button" className="settings-btn" onClick={() => request('reject')} disabled={busy}>
                  {t('import.reject')}
                </button>
                <button
                  type="button"
                  className="settings-btn settings-btn--primary"
                  onClick={() => request('approve')}
                  disabled={busy || drafts.length === 0}
                >
                  {busy ? t('import.saving') : t('import.approve')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {pinOpen && (
        <div className="kiosk-reveal-backdrop">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="magic-import-pin-title"
            className="kiosk-reveal-dialog"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitPin(pin);
            }}
          >
            <h2 id="magic-import-pin-title" className="kiosk-reveal-title">{t('gesture.pinTitle')}</h2>
            <p className="kiosk-reveal-copy">{t('import.pinPrompt')}</p>
            <label className="kiosk-reveal-label" htmlFor="magic-import-pin">{t('gesture.pinLabel')}</label>
            <input
              id="magic-import-pin"
              className="settings-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              aria-invalid={pinError || undefined}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, '').slice(0, 6));
                if (pinError) setPinError(false);
              }}
            />
            {pinError && <p className="kiosk-reveal-error" role="alert">{t('gesture.pinError')}</p>}
            <div className="kiosk-reveal-actions">
              <button type="button" className="settings-btn" onClick={() => setPinOpen(null)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="settings-btn settings-btn--primary">{t('import.continue')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
