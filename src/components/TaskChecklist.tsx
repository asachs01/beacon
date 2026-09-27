import { Fragment, useState } from 'react';
import { Chore, ChoreCompletion, FamilyMember } from '../types/family';
import { hapticMedium, hapticSuccess } from '../hooks/useHaptics';

interface TaskChecklistProps {
  chores: Chore[];
  /** Completions that count for each chore's current round, everyone's. */
  completions: ChoreCompletion[];
  /** Ticks or unticks `choreId` for `memberId`. */
  onToggle: (choreId: string, memberId: string) => void;
  members?: FamilyMember[];
  /** Only this member's rows (the dashboard's member filter). */
  onlyMemberId?: string | null;
}

/**
 * A chore for one person. A chore assigned to two people is two rows, each
 * ticked on its own, as on the Chores screen. The list used to have one row
 * per chore and credit every tick to the first family member, whoever the
 * chore was for.
 */
interface ChecklistRow {
  key: string;
  chore: Chore;
  /** Unset for a chore assigned to no one that no one has done yet. */
  member?: FamilyMember;
  done: boolean;
}

function checklistRows(
  chores: Chore[],
  completions: ChoreCompletion[],
  members: FamilyMember[],
  onlyMemberId: string | null,
): ChecklistRow[] {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const rows: ChecklistRow[] = [];
  for (const chore of chores) {
    const doneBy = new Set(completions.filter((c) => c.chore_id === chore.id).map((c) => c.member_id));
    if (chore.assigned_to?.length) {
      for (const id of new Set(chore.assigned_to)) {
        const member = memberById.get(id);
        if (!member || (onlyMemberId && id !== onlyMemberId)) continue;
        rows.push({ key: `${chore.id}:${id}`, chore, member, done: doneBy.has(id) });
      }
      continue;
    }
    // Assigned to no one, so anyone can do it: done once someone has, with a
    // row for each person who did.
    const doers = [...doneBy]
      .map((id) => memberById.get(id))
      .filter((m): m is FamilyMember => Boolean(m));
    if (doers.length === 0) rows.push({ key: chore.id, chore, done: false });
    for (const member of doers) rows.push({ key: `${chore.id}:${member.id}`, chore, member, done: true });
  }
  return rows;
}

function MemberBadge({ member }: { member: FamilyMember }) {
  return (
    <span
      className="task-checklist-assignee"
      style={{ backgroundColor: member.color + '22', borderColor: member.color }}
    >
      <span className="task-checklist-avatar" aria-hidden="true">
        {member.avatar}
      </span>
      <span className="task-checklist-assignee-name" style={{ color: member.color }}>
        {member.name}
      </span>
    </span>
  );
}

function ChoreLabel({ chore, done }: { chore: Chore; done: boolean }) {
  return (
    <span className={`task-checklist-label${done ? ' task-checklist-label--done' : ''}`}>
      {chore.icon && <span className="task-checklist-icon">{chore.icon}</span>}
      <span className="task-checklist-name" title={chore.name}>{chore.name}</span>
    </span>
  );
}

export function TaskChecklist({ chores, completions, onToggle, members = [], onlyMemberId = null }: TaskChecklistProps) {
  const [animatingKey, setAnimatingKey] = useState<string | null>(null);
  /** The unassigned chore whose "Who did it?" choice is showing. */
  const [pickingKey, setPickingKey] = useState<string | null>(null);

  const rows = checklistRows(chores, completions, members, onlyMemberId);
  const incomplete = rows.filter((row) => !row.done);
  const completed = rows.filter((row) => row.done);

  const complete = (row: ChecklistRow, memberId: string) => {
    setAnimatingKey(row.key);
    setTimeout(() => setAnimatingKey(null), 400);
    hapticMedium();
    // Check if this completes all tasks
    if (incomplete.length === 1) hapticSuccess();
    setPickingKey(null);
    onToggle(row.chore.id, memberId);
  };

  const handleCheck = (row: ChecklistRow) => {
    if (row.member) {
      if (row.done) onToggle(row.chore.id, row.member.id);
      else complete(row, row.member.id);
      return;
    }
    // Nobody to ask about but one person: it was them.
    if (members.length === 1) complete(row, members[0].id);
    else setPickingKey((key) => (key === row.key ? null : row.key));
  };

  const forWhom = (row: ChecklistRow) => (row.member ? ` for ${row.member.name}` : '');

  if (rows.length === 0) {
    return (
      <div className="task-checklist-empty">
        No tasks for today — enjoy the free time
      </div>
    );
  }

  if (incomplete.length === 0) {
    return (
      <div className="task-checklist-done">
        All done — great job!
      </div>
    );
  }

  return (
    <ul className="task-checklist">
      {incomplete.map((row) => (
        <Fragment key={row.key}>
          <li className="task-checklist-item">
            <button
              type="button"
              className={`task-checkbox ${animatingKey === row.key ? 'task-checkbox--completing' : ''}`}
              onClick={() => handleCheck(row)}
              disabled={!row.member && members.length === 0}
              aria-label={`Complete ${row.chore.name}${forWhom(row)}`}
              aria-expanded={row.member ? undefined : pickingKey === row.key}
            >
              <span className="task-checkbox-box" />
            </button>
            <ChoreLabel chore={row.chore} done={false} />
            {row.member && <MemberBadge member={row.member} />}
          </li>
          {pickingKey === row.key && (
            <li className="task-checklist-picker">
              <span className="task-checklist-picker-prompt">Who did it?</span>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="task-checklist-assignee task-checklist-picker-btn"
                  style={{ backgroundColor: m.color + '22', borderColor: m.color }}
                  onClick={() => complete(row, m.id)}
                  aria-label={`${m.name} did ${row.chore.name}`}
                >
                  <span className="task-checklist-avatar" aria-hidden="true">
                    {m.avatar}
                  </span>
                  <span className="task-checklist-assignee-name" style={{ color: m.color }}>
                    {m.name}
                  </span>
                </button>
              ))}
            </li>
          )}
        </Fragment>
      ))}
      {completed.map((row) => (
        <li key={row.key} className="task-checklist-item task-checklist-item--done">
          <button
            type="button"
            className="task-checkbox task-checkbox--checked"
            onClick={() => handleCheck(row)}
            aria-label={`Undo ${row.chore.name}${forWhom(row)}`}
          >
            <span className="task-checkbox-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          </button>
          <ChoreLabel chore={row.chore} done />
          {row.member && <MemberBadge member={row.member} />}
        </li>
      ))}
    </ul>
  );
}
