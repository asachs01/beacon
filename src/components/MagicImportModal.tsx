import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { AnyListClient } from '../api/anylist';
import { GrocyClient } from '../api/grocy';
import { hasToken } from '../api/ha-rest';
import type { HomeAssistantClient } from '../api/homeassistant';
import { useEntityOptions } from './cards/EntityPicker';
import { calendarWriteFromDraft, pickCalendarId, pickListId, type ListTarget } from '../import/commit';
import { extractMagicImport, planMagicImport, type Extraction } from '../import/extract';
import type { NamedAgent } from '../import/agent';
import { conversationDeps } from '../import/ha';
import { readImageWithHomeAssistant } from '../import/ha-media';
import { householdTimeZone } from '../import/calendar';
import {
  MAX_IMPORT_BYTES,
  beaconMediaFilename,
  fileProblem,
  importFileKind,
} from '../import/files';
import { heicToJpeg } from '../import/heic';
import { readPdfDocument, type PdfRead } from '../import/pdf-read';
import { nameAiTaskEntity, photoImportUnavailable } from '../import/photo-route';
import { importPinDecision } from '../import/pin-gate';
import { cameraCaptureAvailable } from '../native';
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
  /** AI Task entity for photos and scanned PDFs. Empty leaves that path off. */
  aiTaskEntityId?: string;
  /** Friendly name when the entity list has not loaded. Tests pass this. */
  aiTaskEntityName?: string;
  /** Tests force the camera control. Otherwise native and touch devices show it. */
  showCamera?: boolean;
  /** Tests replace HEIC decoding. A failure must surface import.heicError. */
  convertHeic?: (file: Blob) => Promise<Blob>;
  /** Tests replace pdfjs. The real reader lazy-loads pdfjs. */
  readPdf?: (data: ArrayBuffer) => Promise<PdfRead>;
  /** Tests replace the Home Assistant image task. */
  extractImage?: (image: { blob: Blob; mime: string; filename: string }) => Promise<Extraction & { mediaLeftBehind?: boolean }>;
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

function taskKey(agent: NamedAgent, done: boolean): TranslationKey {
  if (agent.locality === 'local') return done ? 'import.pathTaskLocalDone' : 'import.pathTaskLocal';
  if (agent.locality === 'cloud') return done ? 'import.pathTaskCloudDone' : 'import.pathTaskCloud';
  return done ? 'import.pathTaskMaybeDone' : 'import.pathTaskMaybe';
}

interface PreparedFile {
  kind: 'text' | 'image';
  text?: string;
  blob?: Blob;
  mime?: string;
  filename?: string;
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
  aiTaskEntityId = '',
  aiTaskEntityName,
  showCamera,
  convertHeic,
  readPdf,
  extractImage,
  onAddListItem,
  now,
  timeZone,
}: MagicImportModalProps) {
  const { t } = useTranslation();
  const localTasks = useLocalTasks();
  const entityOptions = useEntityOptions();
  const [haLists, setHaLists] = useState<ListTarget[]>([]);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'paste' | 'review'>('paste');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [planned, setPlanned] = useState<Pick<Extraction, 'source' | 'agent'> | null>(null);
  const [source, setSource] = useState<Extraction['source']>('local');
  const [agent, setAgent] = useState<NamedAgent | null>(null);
  const [routeKind, setRouteKind] = useState<'text' | 'image'>('text');
  const [prepared, setPrepared] = useState<PreparedFile | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileBlocked, setFileBlocked] = useState(false);
  const [mediaNote, setMediaNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pinOpen, setPinOpen] = useState<'approve' | 'reject' | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const cameraOn = showCamera ?? cameraCaptureAvailable();

  const taskAgent = useMemo(() => {
    if (photoImportUnavailable(useHaAgent, aiTaskEntityId)) return null;
    const match = entityOptions.find((option) => option.entity_id === aiTaskEntityId);
    return nameAiTaskEntity(aiTaskEntityId, aiTaskEntityName || match?.label);
  }, [aiTaskEntityId, aiTaskEntityName, entityOptions, useHaAgent]);

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

  const blockPhoto = (reason: 'local-only' | 'no-entity') => {
    setPrepared(null);
    setFileName('');
    setFileBlocked(true);
    setError(t(reason === 'local-only' ? 'import.photoOff' : 'import.photoNoEntity'));
  };

  const holdImage = (image: { blob: Blob; mime: string; filename: string }, name: string) => {
    const unavailable = photoImportUnavailable(useHaAgent, aiTaskEntityId);
    if (unavailable) {
      blockPhoto(unavailable);
      return;
    }
    setFileBlocked(false);
    setPrepared({ kind: 'image', ...image });
    setFileName(name);
    setError('');
  };

  const clearFile = () => {
    setPrepared(null);
    setFileName('');
    setFileBlocked(false);
    setError('');
  };

  const acceptFiles = async (list: FileList | null) => {
    setPrepared(null);
    setFileName('');
    setFileBlocked(false);
    setError('');
    if (!list || list.length === 0) return;
    const problem = fileProblem(list);
    if (problem) {
      setFileBlocked(true);
      setError(t(problem));
      return;
    }
    const file = list[0];
    const kind = importFileKind(file);
    if (!kind) {
      setFileBlocked(true);
      setError(t('import.badType'));
      return;
    }
    try {
      if (kind === 'heic') {
        let jpeg: Blob;
        try {
          jpeg = await (convertHeic ?? heicToJpeg)(file);
        } catch {
          setFileBlocked(true);
          setError(t('import.heicError'));
          return;
        }
        if (!jpeg || jpeg.size < 1) {
          setFileBlocked(true);
          setError(t('import.heicError'));
          return;
        }
        if (jpeg.size > MAX_IMPORT_BYTES) {
          setFileBlocked(true);
          setError(t('import.tooLarge'));
          return;
        }
        holdImage({ blob: jpeg, mime: 'image/jpeg', filename: beaconMediaFilename('jpg') }, file.name);
        return;
      }
      if (kind === 'jpeg' || kind === 'png') {
        holdImage({
          blob: file,
          mime: kind === 'png' ? 'image/png' : 'image/jpeg',
          filename: beaconMediaFilename(kind === 'png' ? 'png' : 'jpg'),
        }, file.name);
        return;
      }
      const doc = await (readPdf ?? readPdfDocument)(await file.arrayBuffer());
      if (doc.route === 'text') {
        const body = doc.text.trim();
        if (!body) {
          setFileBlocked(true);
          setError(t('import.imageFailed'));
          return;
        }
        setPrepared({ kind: 'text', text: body });
        setFileName(file.name);
        return;
      }
      const unavailable = photoImportUnavailable(useHaAgent, aiTaskEntityId);
      if (unavailable) {
        setFileBlocked(true);
        setError(t(unavailable === 'local-only' ? 'import.photoOff' : 'import.photoNoEntity'));
        return;
      }
      const blob = await doc.renderFirstPage();
      if (!blob || blob.size < 1) {
        setFileBlocked(true);
        setError(t('import.imageFailed'));
        return;
      }
      if (blob.size > MAX_IMPORT_BYTES) {
        setFileBlocked(true);
        setError(t('import.tooLarge'));
        return;
      }
      setPrepared({
        kind: 'image',
        blob,
        mime: 'image/jpeg',
        filename: beaconMediaFilename('jpg'),
      });
      setFileName(file.name);
    } catch (err) {
      setFileBlocked(true);
      setPrepared(null);
      setFileName('');
      setError(err instanceof Error && err.message ? err.message : t('import.imageFailed'));
    }
  };

  const onPickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    event.target.value = '';
    void acceptFiles(files);
  };

  const extractText = async () => {
    if (busy || fileBlocked) return;
    const image = prepared?.kind === 'image' && prepared.blob && prepared.mime && prepared.filename
      ? { blob: prepared.blob, mime: prepared.mime, filename: prepared.filename }
      : null;
    const body = prepared?.kind === 'text' ? (prepared.text ?? '').trim() : text.trim();
    if (!image && !body) return;
    setBusy(true);
    setError('');
    setMediaNote('');
    try {
      const ctx = {
        now: now ?? new Date(),
        timeZone: timeZone ?? householdTimeZone(),
        locale,
      };
      const result = image
        ? (extractImage
          ? await extractImage(image)
          : await readImageWithHomeAssistant(getClient, aiTaskEntityId, taskAgent?.name, image, ctx))
        : (extract
          ? await extract(body)
          : await extractMagicImport(body, ctx, conversationDeps(getClient, useHaAgent)));
      setRouteKind(image ? 'image' : 'text');
      setSource(result.source);
      setAgent(result.agent);
      if (image && 'mediaLeftBehind' in result && result.mediaLeftBehind) {
        setMediaNote(t('import.mediaLeft', { name: image.filename }));
      }
      setDrafts(buildDrafts(result, calendars, lists, {
        calendarId: defaultCalendarId,
        groceryListId: defaultGroceryListId,
        todoListId: defaultTodoListId,
      }));
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t(image ? 'import.imageFailed' : 'import.saveError'));
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
              <div className="magic-import-file">
                <label className="settings-btn">
                  {t('import.addFile')}
                  <input
                    aria-label={t('import.addFile')}
                    type="file"
                    accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif,application/pdf,.pdf"
                    onChange={onPickFile}
                  />
                </label>
                {cameraOn && (
                  <label className="settings-btn">
                    {t('import.takePhoto')}
                    <input
                      aria-label={t('import.takePhoto')}
                      type="file"
                      accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif"
                      capture="environment"
                      onChange={onPickFile}
                    />
                  </label>
                )}
                {(fileName || fileBlocked) && (
                  <button type="button" className="settings-btn" onClick={clearFile}>
                    {t('import.removeFile')}
                  </button>
                )}
              </div>
              {fileName && (
                <p className="magic-import-hint">{t('import.fileSelected', { name: fileName })}</p>
              )}
              <label className="magic-import-label" htmlFor="magic-import-text">{t('import.pasteLabel')}</label>
              <p className="magic-import-hint">{t('import.pasteHint')}</p>
              {!fileBlocked && prepared?.kind === 'image' && taskAgent && (
                <p className="magic-import-hint">
                  {t(taskKey(taskAgent, false), { name: taskAgent.name, id: taskAgent.id })}
                </p>
              )}
              {!fileBlocked && prepared?.kind !== 'image' && planned && (
                <p className="magic-import-hint">
                  {t(readerKey(planned, false), {
                    name: planned.agent?.name ?? '',
                    id: planned.agent?.id ?? '',
                  })}
                </p>
              )}
              {!fileBlocked && prepared?.kind === 'image' && (
                <p className="magic-import-privacy">{t('import.privacyFile')}</p>
              )}
              {!fileBlocked && prepared?.kind !== 'image' && planned?.source === 'home-assistant' && (
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
                {routeKind === 'image' && agent
                  ? t(taskKey(agent, true), { name: agent.name, id: agent.id })
                  : t(readerKey({ source, agent }, true), {
                    name: agent?.name ?? '',
                    id: agent?.id ?? '',
                  })}
              </p>
              {routeKind === 'image' ? (
                <p className="magic-import-privacy">{t('import.privacyFile')}</p>
              ) : source === 'home-assistant' && (
                <p className="magic-import-privacy">{t('import.privacy')}</p>
              )}
              {mediaNote && <p className="magic-import-hint">{mediaNote}</p>}
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
              <button type="button" className="settings-btn settings-btn--primary" onClick={() => { void extractText(); }} disabled={busy || fileBlocked || (!prepared && !text.trim())}>
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
