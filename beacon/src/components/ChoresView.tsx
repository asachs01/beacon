import { useState } from 'react';
import { Chore } from '../types/family';
import { ChoreCard } from './ChoreCard';
import { StreakBadge } from './StreakBadge';
import { useChores } from '../hooks/useChores';
import { useFamily } from '../hooks/useFamily';
import { useSettings } from '../hooks/useSettings';
import '../styles/chores-view.css';

interface ChoresViewProps {
  /** When true, auto-open the add chore form on mount */
  showAddForm?: boolean;
}

const CHORE_ICONS = ['🧹', '🍽️', '🐕', '🛏️', '📚', '🗑️', '👕', '🧺', '🪥', '🚿', '🧼', '💪'];

function formatBalance(cents: number, symbol: string): string {
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export function ChoresView({ showAddForm: initialShowAdd = false }: ChoresViewProps) {
  const { members } = useFamily();
  const { settings } = useSettings();
  const {
    addChore,
    completeChore,
    uncompleteChore,
    isChoreCompletedToday,
    isChoreMaxedOut,
    getCompletionCount,
    getStreakForMember,
    getChoresForMember,
    getMemberProgress,
    balances,
    generatePayoutChores,
  } = useChores(settings.payoutSchedule);

  // Filter: null = show all, string = show specific member
  const kids = members.filter((m) => m.role === 'child');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    kids.length > 0 ? kids[0].id : null
  );

  // Add chore form state
  const [showAddFormState, setShowAddForm] = useState(initialShowAdd);
  const [valueDisplay, setValueDisplay] = useState('1.00');
  const [newChore, setNewChore] = useState({
    name: '',
    value_cents: 100,
    frequency: 'daily' as Chore['frequency'],
    max_completions: undefined as number | undefined,
    assigned_to: [] as string[],
    icon: '🧹',
  });

  const handleAddChore = () => {
    if (!newChore.name.trim() || newChore.assigned_to.length === 0) return;
    addChore({
      name: newChore.name.trim(),
      value_cents: newChore.value_cents,
      frequency: newChore.frequency,
      max_completions: newChore.max_completions,
      assigned_to: newChore.assigned_to,
      icon: newChore.icon,
    });
    setNewChore({
      name: '',
      value_cents: 100,
      frequency: 'daily',
      max_completions: undefined,
      assigned_to: [],
      icon: '🧹',
    });
    setValueDisplay('1.00');
    setShowAddForm(false);
  };

  const toggleAssigned = (memberId: string) => {
    setNewChore((prev) => ({
      ...prev,
      assigned_to: prev.assigned_to.includes(memberId)
        ? prev.assigned_to.filter((id) => id !== memberId)
        : [...prev.assigned_to, memberId],
    }));
  };

  const hasParent = members.some((m) => m.role === 'parent');
  const anyKidHasBalance = members.some((m) => m.role === 'child' && (balances[m.id] ?? 0) > 0);

  // Build the list of members to display
  const displayMembers = selectedMemberId
    ? members.filter((m) => m.id === selectedMemberId)
    : members;

  const renderMemberSection = (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return null;

    const memberChores = getChoresForMember(member.id);
    const progress = getMemberProgress(member.id);
    const streak = getStreakForMember(member.id);
    const balance = balances[member.id] ?? 0;
    const progressPct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

    // Split chores into active and completed
    const activeChores = memberChores.filter(
      (c) => !isChoreCompletedToday(c.id, member.id) || (c.max_completions && c.max_completions > 1)
    );
    const completedChores = memberChores.filter(
      (c) => isChoreCompletedToday(c.id, member.id) && !(c.max_completions && c.max_completions > 1)
    );

    return (
      <div key={member.id} className="cv-member-section">
        {/* Member header — shown in "all" mode or single mode */}
        <div className="cv-member-header">
          <span
            className="cv-member-avatar"
            style={{ backgroundColor: member.color + '22', borderColor: member.color }}
          >
            {member.avatar}
          </span>
          <div className="cv-member-info">
            <span className="cv-member-name">{member.name}</span>
            <div className="cv-member-meta">
              {member.role === 'child' && balance > 0 && (
                <span className="cv-balance" style={{ color: member.color }}>
                  {'\u{1F4B0}'} {formatBalance(balance, settings.currencySymbol)} earned
                </span>
              )}
              <StreakBadge streak={streak} size={selectedMemberId ? 'md' : 'sm'} />
            </div>
          </div>
        </div>

        {/* Progress */}
        {memberChores.length > 0 && (
          <div className="cv-progress">
            <div className="cv-progress-bar">
              <div
                className="cv-progress-fill"
                style={{ width: `${progressPct}%`, backgroundColor: member.color }}
              />
            </div>
            <span className="cv-progress-text">
              {progress.completed}/{progress.total} done today
            </span>
          </div>
        )}

        {/* Active chores */}
        {activeChores.length === 0 && completedChores.length === 0 ? (
          <div className="cv-empty">No chores assigned</div>
        ) : (
          <div className="cv-chore-list">
            {activeChores.map((chore) => (
              <ChoreCard
                key={`${chore.id}-${member.id}`}
                chore={chore}
                member={member}
                isCompleted={isChoreCompletedToday(chore.id, member.id)}
                completionCount={chore.max_completions ? getCompletionCount(chore, member.id) : undefined}
                isMaxedOut={isChoreMaxedOut(chore, member.id)}
                onComplete={() => completeChore(chore.id, member.id)}
                onUncomplete={() => uncompleteChore(chore.id, member.id)}
              />
            ))}
          </div>
        )}

        {/* Completed chores */}
        {completedChores.length > 0 && (
          <div className="cv-completed-section">
            <span className="cv-completed-label">Completed</span>
            <div className="cv-chore-list">
              {completedChores.map((chore) => (
                <ChoreCard
                  key={`${chore.id}-${member.id}-done`}
                  chore={chore}
                  member={member}
                  isCompleted={true}
                  onComplete={() => completeChore(chore.id, member.id)}
                  onUncomplete={() => uncompleteChore(chore.id, member.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="cv-page">
      {/* Header */}
      <header className="cv-header">
        <h1 className="cv-title">Chores</h1>
      </header>

      {/* Member filter tabs */}
      {members.length > 1 && (
        <div className="cv-filter-tabs">
          <button
            type="button"
            className={`cv-filter-tab ${selectedMemberId === null ? 'cv-filter-tab--active' : ''}`}
            onClick={() => setSelectedMemberId(null)}
          >
            <span className="cv-filter-tab-avatar">👨‍👩‍👧‍👦</span>
            <span className="cv-filter-tab-label">All</span>
          </button>
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`cv-filter-tab ${selectedMemberId === m.id ? 'cv-filter-tab--active' : ''}`}
              onClick={() => setSelectedMemberId(m.id)}
              style={
                selectedMemberId === m.id
                  ? { borderColor: m.color, backgroundColor: m.color + '12' }
                  : {}
              }
            >
              <span className="cv-filter-tab-avatar">{m.avatar}</span>
              <span className="cv-filter-tab-label">{m.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="cv-content">
        {members.length === 0 ? (
          <div className="cv-empty-page">
            Add family members first to assign chores.
          </div>
        ) : (
          displayMembers.map((m) => renderMemberSection(m.id))
        )}

        {/* Generate Payouts button */}
        {hasParent && anyKidHasBalance && (
          <button
            type="button"
            className="btn btn--secondary cv-payout-btn"
            onClick={() => generatePayoutChores()}
          >
            {'\u{1F4B0}'} Generate Payouts
          </button>
        )}

        {/* Add Chore — parent controls */}
        {(hasParent || members.length > 0) && (
          <>
            {!showAddFormState ? (
              <button
                type="button"
                className="btn btn--primary cv-add-btn"
                onClick={() => setShowAddForm(true)}
              >
                + Add Chore
              </button>
            ) : (
              <div
                className="cv-add-form"
                onFocus={(e) => {
                  setTimeout(
                    () => (e.target as HTMLElement).scrollIntoView?.({ behavior: 'smooth', block: 'center' }),
                    300
                  );
                }}
              >
                <h3 className="cv-add-form-title">New Chore</h3>

                {/* Icon picker */}
                <div className="form-field">
                  <label className="form-label">Icon</label>
                  <div className="fm-avatar-grid">
                    {CHORE_ICONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        className={`fm-avatar-option ${newChore.icon === icon ? 'fm-avatar-option--selected' : ''}`}
                        onClick={() => setNewChore((f) => ({ ...f, icon }))}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-field">
                  <label className="form-label">Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newChore.name}
                    onChange={(e) => setNewChore((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g., Vacuum living room"
                    autoFocus
                  />
                </div>

                <div className="form-field">
                  <label className="form-label">Value</label>
                  <div className="chores-value-input">
                    <span className="chores-value-prefix">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-input"
                      value={valueDisplay}
                      onChange={(e) => setValueDisplay(e.target.value)}
                      onBlur={() => {
                        const cents = Math.round(parseFloat(valueDisplay || '0') * 100);
                        setNewChore((f) => ({ ...f, value_cents: cents }));
                        setValueDisplay((cents / 100).toFixed(2));
                      }}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label className="form-label">Frequency</label>
                  <select
                    className="form-select"
                    value={newChore.frequency}
                    onChange={(e) =>
                      setNewChore((f) => ({ ...f, frequency: e.target.value as Chore['frequency'] }))
                    }
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="once">One-time</option>
                  </select>
                </div>

                {newChore.frequency !== 'once' && (
                  <div className="form-field">
                    <label className="form-label">
                      Max per {newChore.frequency === 'daily' ? 'day' : 'week'}
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      value={newChore.max_completions ?? ''}
                      onChange={(e) =>
                        setNewChore((f) => ({
                          ...f,
                          max_completions: e.target.value ? parseInt(e.target.value) : undefined,
                        }))
                      }
                      placeholder="Unlimited"
                      min="1"
                      max="99"
                    />
                  </div>
                )}

                <div className="form-field">
                  <label className="form-label">Assign To</label>
                  <div className="chores-assign-grid">
                    {members.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`chores-assign-btn ${newChore.assigned_to.includes(m.id) ? 'chores-assign-btn--active' : ''}`}
                        onClick={() => toggleAssigned(m.id)}
                        style={
                          newChore.assigned_to.includes(m.id)
                            ? { borderColor: m.color, backgroundColor: m.color + '15' }
                            : {}
                        }
                      >
                        <span>{m.avatar}</span>
                        <span>{m.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="chores-add-actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => setShowAddForm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={handleAddChore}
                    disabled={!newChore.name.trim() || newChore.assigned_to.length === 0}
                  >
                    Add Chore
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
