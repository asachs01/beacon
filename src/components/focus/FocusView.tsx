import { useState, useEffect, useMemo, useRef, CSSProperties } from 'react';
import { format } from 'date-fns';
import { useFamily } from '../../hooks/useFamily';
import { useChores } from '../../hooks/useChores';
import { useRoutines } from '../../hooks/useRoutines';
import { useClock } from '../../hooks/useClock';
import { BeaconSettings } from '../../hooks/useSettings';
import { localDayKey } from '../../api/date-keys';
import { ScreenSaver } from '../ScreenSaver';
import { RoutineCard } from './RoutineCard';
import { FocusChores } from './FocusChores';
import { pickRoutine, getTimeOfDay } from './period';
import '../../styles/focus.css';
import { SaveFailedNotice } from '../SaveFailedNotice';
import { getParentPinMembers, unlockParent } from '../../api/beacon-auth';
import { isAddOn } from '../../utils/ha-env';

interface FocusViewProps {
  memberId: string;
  settings: BeaconSettings;
  onExit: () => void;
}

const GREETINGS = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
} as const;

/** Changes when the greeting and routine do: at noon, 5pm and midnight. */
const byPeriod = (d: Date) => `${localDayKey(d)} ${getTimeOfDay(d)}`;

/** The clock keeps its own time, so the lists below don't re-render every minute. */
function FocusClock({ timeFormat, onTap }: { timeFormat: BeaconSettings['timeFormat']; onTap: () => void }) {
  const now = useClock();
  return (
    <button type="button" className="focus-clock" onClick={onTap} aria-label="Clock">
      <div className="focus-time">{format(now, timeFormat === '24h' ? 'HH:mm' : 'h:mm a')}</div>
      <div className="focus-date">{format(now, 'EEEE, MMMM d')}</div>
    </button>
  );
}

export function FocusView({ memberId, settings, onExit }: FocusViewProps) {
  const { members } = useFamily();
  const routinesApi = useRoutines(memberId);
  const choresApi = useChores();

  const member = members.find((m) => m.id === memberId);

  const now = useClock(byPeriod);

  // Periodic data refresh so a wall display picks up edits made elsewhere
  const { refresh: refreshRoutines } = routinesApi;
  const { refresh: refreshChores } = choresApi;
  useEffect(() => {
    const t = setInterval(() => {
      refreshRoutines();
      refreshChores();
    }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [refreshRoutines, refreshChores]);

  // Exit gesture: 5 taps on the clock within 3 seconds
  const taps = useRef<number[]>([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [exitPin, setExitPin] = useState('');
  const [exitError, setExitError] = useState('');
  const [checkingPin, setCheckingPin] = useState(false);
  const [parentId, setParentId] = useState('');
  const [parents, setParents] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!showExitConfirm || !isAddOn()) return;
    let active = true;
    getParentPinMembers().then((list) => {
      if (active) setParents(list);
    }).catch((err: unknown) => {
      if (active) setExitError(err instanceof Error ? err.message : 'Could not load parent profiles');
    });
    return () => { active = false; };
  }, [showExitConfirm]);
  const cancelExit = () => {
    setExitPin('');
    setExitError('');
    setParentId('');
    setShowExitConfirm(false);
  };
  const confirmExit = async () => {
    if (!isAddOn()) {
      onExit();
      return;
    }
    setCheckingPin(true);
    setExitError('');
    try {
      const session = await unlockParent(exitPin, parentId || undefined);
      if (session.role !== 'parent') throw new Error('Parent access was not granted');
      onExit();
    } catch (err) {
      setExitError(err instanceof Error ? err.message : 'Could not verify parent PIN');
    } finally {
      setCheckingPin(false);
    }
  };
  const handleClockTap = () => {
    const t = Date.now();
    taps.current = [...taps.current.filter((prev) => t - prev < 3000), t];
    if (taps.current.length >= 5) {
      taps.current = [];
      setShowExitConfirm(true);
    }
  };

  const memberChores = useMemo(
    () => choresApi.chores.filter((c) => c.assigned_to.includes(memberId)),
    [choresApi.chores, memberId]
  );
  const completedChoreIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of choresApi.currentCompletions) {
      if (c.member_id === memberId) ids.add(c.chore_id);
    }
    return ids;
  }, [choresApi.currentCompletions, memberId]);

  const pick = pickRoutine(routinesApi.routines, now);

  if (!member) {
    // Member deleted while display active: App-level guard exits on next render
    return null;
  }

  const currentRoutineTasks = pick && pick.isCurrent ? pick.routine.tasks : [];
  const routineDone = currentRoutineTasks.every((t) =>
    routinesApi.isTaskCompletedToday(pick!.routine.id, t.id, memberId)
  );
  const choresDone = memberChores.every((c) => completedChoreIds.has(c.id));
  const hadItems = currentRoutineTasks.length + memberChores.length > 0;
  const allDone = hadItems && routineDone && choresDone;

  return (
    <div className="focus-view" style={{ '--focus-accent': member.color } as CSSProperties}>
      <header className="focus-header">
        <div className="focus-member">
          <span
            className="focus-avatar"
            style={{ borderColor: member.color, backgroundColor: member.color + '22' }}
          >
            {member.avatar}
          </span>
          <div>
            <div className="focus-greeting">{GREETINGS[getTimeOfDay(now)]},</div>
            <div className="focus-name">{member.name}</div>
          </div>
        </div>
        <FocusClock timeFormat={settings.timeFormat} onTap={handleClockTap} />
      </header>

      <main className="focus-body">
        {allDone ? (
          <div className="focus-celebration">
            <div className="focus-celebration-emoji">🎉</div>
            <div className="focus-celebration-title">All done — great job!</div>
          </div>
        ) : (
          <>
            {pick && (
              <RoutineCard
                routine={pick.routine}
                label={pick.label}
                interactive={pick.isCurrent}
                isTaskCompleted={(taskId) =>
                  routinesApi.isTaskCompletedToday(pick.routine.id, taskId, memberId)
                }
                onToggleTask={(taskId) => routinesApi.toggleTask(pick.routine, taskId)}
              />
            )}
            <FocusChores
              chores={memberChores}
              completedIds={completedChoreIds}
              currencySymbol={settings.currencySymbol}
              onToggle={(choreId) =>
                completedChoreIds.has(choreId)
                  ? choresApi.uncompleteChore(choreId, memberId)
                  : choresApi.completeChore(choreId, memberId)
              }
            />
            {!pick && memberChores.length === 0 && (
              <div className="focus-empty">
                Nothing scheduled yet. A parent can add routines and chores in Settings.
              </div>
            )}
          </>
        )}
      </main>

      {showExitConfirm && (
        <div className="focus-exit-backdrop" onClick={cancelExit}>
          <div className="focus-exit-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Exit {member.name}&rsquo;s display?</p>
            {isAddOn() && parents.length > 0 && (
              <label className="focus-exit-pin">
                Parent profile
                <select value={parentId} onChange={(e) => { setParentId(e.target.value); setExitError(''); }}>
                  <option value="">Configured parent PIN</option>
                  {parents.map((parent) => (
                    <option key={parent.id} value={parent.id}>{parent.name}&rsquo;s PIN</option>
                  ))}
                </select>
              </label>
            )}
            {isAddOn() && (
              <label className="focus-exit-pin">
                Parent PIN
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={exitPin}
                  onChange={(e) => { setExitPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setExitError(''); }}
                  maxLength={8}
                />
              </label>
            )}
            {exitError && <p role="alert" className="focus-exit-error">{exitError}</p>}
            <div className="focus-exit-actions">
              <button type="button" className="settings-btn" onClick={cancelExit}>
                Cancel
              </button>
              <button
                type="button"
                className="settings-btn settings-btn--primary"
                onClick={() => void confirmExit()}
                disabled={checkingPin || (isAddOn() && exitPin.length < (parentId ? 4 : 6))}
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      <SaveFailedNotice />

      <ScreenSaver
        enabled={settings.screenSaverEnabled}
        dimTimeoutMin={settings.dimTimeout}
        screenSaverTimeoutMin={settings.screenSaverTimeout}
        timeFormat={settings.timeFormat}
      />
    </div>
  );
}
