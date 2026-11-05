import { useState, useEffect, useMemo, useRef, CSSProperties } from 'react';
import { format } from 'date-fns';
import { useFamily } from '../../hooks/useFamily';
import { useChoreOps } from '../../hooks/useChoreOps';
import { findUserForMember } from '../../api/choreops';
import { MemberAvatar } from '../MemberAvatar';
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
  const choreOps = useChoreOps();

  const member = members.find((m) => m.id === memberId);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Periodic data refresh so a wall display picks up edits made elsewhere
  const { refresh: refreshRoutines } = routinesApi;
  const { refresh: refreshChores } = choreOps;
  useEffect(() => {
    const t = setInterval(
      () => {
        refreshRoutines();
        refreshChores();
      },
      5 * 60 * 1000,
    );
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

  // ChoreOps owns chore data: resolve this member's ChoreOps user, then take
  // the chores ChoreOps assigns to them.
  const choreOpsUser = useMemo(
    () => (member ? findUserForMember(member, choreOps.data?.users ?? []) : null),
    [member, choreOps.data],
  );

  const memberChores = useMemo(() => {
    const assignee = choreOpsUser?.name.trim().toLowerCase();
    if (!assignee) return [];

    return (choreOps.data?.chores ?? [])
      .filter((chore) => chore.assignee?.trim().toLowerCase() === assignee)
      .map((chore) => ({
        id: chore.id,
        name: chore.name,
        assigned_to: [memberId],
        frequency: 'once' as const,
        value_cents: 0,
        icon: chore.icon ?? undefined,
      }));
  }, [choreOps.data, choreOpsUser, memberId]);

  const completedChoreIds = useMemo(() => {
    const ids = new Set<string>();
    for (const chore of choreOps.data?.chores ?? []) {
      if (/^(approved|completed|done)/i.test(chore.status)) ids.add(chore.id);
    }
    return ids;
  }, [choreOps.data]);

  const pick = pickRoutine(routinesApi.routines, now);

  if (!member) {
    // Member deleted while display active: App-level guard exits on next render
    return null;
  }

  const currentRoutineTasks = pick && pick.isCurrent ? pick.routine.tasks : [];
  const routineDone = currentRoutineTasks.every((t) =>
    routinesApi.isTaskCompletedToday(pick!.routine.id, t.id, memberId),
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
            <MemberAvatar member={member} />
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
              onToggle={(choreId) => {
                // ChoreOps has no un-complete action: ticking claims or approves.
                const chore = choreOps.data?.chores.find((c) => c.id === choreId);
                const buttonEid = chore?.actions.claim ?? chore?.actions.approve;
                if (buttonEid) void choreOps.pressButton(buttonEid);
              }}
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
              <button
                type="button"
                className="settings-btn"
                onClick={() => setShowExitConfirm(false)}
              >
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
