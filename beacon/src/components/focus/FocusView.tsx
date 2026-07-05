import { useState, useEffect, useMemo, useRef, CSSProperties } from 'react';
import { format } from 'date-fns';
import { useFamily } from '../../hooks/useFamily';
import { useChores } from '../../hooks/useChores';
import { useRoutines } from '../../hooks/useRoutines';
import { BeaconSettings } from '../../hooks/useSettings';
import { ScreenSaver } from '../ScreenSaver';
import { RoutineCard } from './RoutineCard';
import { FocusChores } from './FocusChores';
import { pickRoutine, getTimeOfDay } from './period';

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

export function FocusView({ memberId, settings, onExit }: FocusViewProps) {
  const { members } = useFamily();
  const routinesApi = useRoutines(memberId);
  const choresApi = useChores();

  const member = members.find((m) => m.id === memberId);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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
    for (const c of choresApi.completionsToday) {
      if (c.member_id === memberId) ids.add(c.chore_id);
    }
    return ids;
  }, [choresApi.completionsToday, memberId]);

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
        <button type="button" className="focus-clock" onClick={handleClockTap} aria-label="Clock">
          <div className="focus-time">
            {format(now, settings.timeFormat === '24h' ? 'HH:mm' : 'h:mm a')}
          </div>
          <div className="focus-date">{format(now, 'EEEE, MMMM d')}</div>
        </button>
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
        <div className="focus-exit-backdrop" onClick={() => setShowExitConfirm(false)}>
          <div className="focus-exit-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Exit {member.name}&rsquo;s display?</p>
            <div className="focus-exit-actions">
              <button type="button" className="settings-btn" onClick={() => setShowExitConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="settings-btn settings-btn--primary" onClick={onExit}>
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      <ScreenSaver
        enabled={settings.screenSaverEnabled}
        dimTimeoutMin={settings.dimTimeout}
        screenSaverTimeoutMin={settings.screenSaverTimeout}
      />
    </div>
  );
}
