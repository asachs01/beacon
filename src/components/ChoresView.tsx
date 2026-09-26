import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Chore, FamilyMember, STAR_CURRENCY, formatChoreValue } from '../types/family';
import { ChoreCard } from './ChoreCard';
import { StreakBadge } from './StreakBadge';
import { useChores } from '../hooks/useChores';
import { useFamily } from '../hooks/useFamily';
import { useSettings } from '../hooks/useSettings';
import { useMediaQuery } from '../hooks/useMediaQuery';

/**
 * Member columns are shown side by side only when every member fits in
 * one row at a readable width (keep in sync with .chores-family-grid) and
 * the screen is tall enough for a useful list. Otherwise — phones, short
 * landscape displays like the Echo Show 5 (960×480), or more members than
 * fit across — one member is shown at a time, picked from tabs.
 */
const MIN_COLUMN_WIDTH = 280;
const COLUMN_GAP = 20;
const SHORT_SCREEN_QUERY = '(max-height: 540px)';

/** Width of an element's content box, kept up to date as it resizes. */
function useContentWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const CHORE_ICONS = ['🧹', '🍽️', '🐕', '🛏️', '📚', '🗑️', '👕', '🧺', '🪥', '🚿', '🧼', '💪'];

const EMPTY_CHORE_FORM = {
  name: '',
  value_cents: 100,
  frequency: 'daily' as Chore['frequency'],
  assigned_to: [] as string[],
  icon: '🧹',
};

interface UnassignedChoreCardProps {
  chore: Chore;
  members: FamilyMember[];
  onClaim: (choreId: string, memberId: string) => void;
  onComplete: (choreId: string, memberId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  currencySymbol?: string;
}

function UnassignedChoreCard({
  chore,
  members,
  onClaim,
  onComplete,
  onEdit,
  onDelete,
  currencySymbol = '$',
}: UnassignedChoreCardProps) {
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [pickerAction, setPickerAction] = useState<'claim' | 'complete'>('claim');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleMemberSelect = (memberId: string) => {
    if (pickerAction === 'claim') {
      onClaim(chore.id, memberId);
    } else {
      onComplete(chore.id, memberId);
    }
    setShowMemberPicker(false);
  };

  const handleDeleteClick = () => {
    if (confirmDelete) {
      onDelete();
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  const value = formatChoreValue(chore.value_cents, currencySymbol);

  return (
    <div className="unassigned-chore-card">
      <div className="chore-card-body">
        <span className="chore-card-name">
          {chore.icon && <span className="chore-card-icon">{chore.icon}</span>}
          {chore.name}
        </span>
        {value && <span className="chore-card-value">{value}</span>}
      </div>

      <div className="chore-card-actions">
        <button
          type="button"
          className="btn btn--sm btn--secondary"
          onClick={() => {
            setPickerAction('claim');
            setShowMemberPicker(true);
          }}
        >
          Claim
        </button>
        <button
          type="button"
          className="btn btn--sm btn--primary"
          onClick={() => {
            setPickerAction('complete');
            setShowMemberPicker(true);
          }}
        >
          Complete
        </button>
        <button
          type="button"
          className="chore-card-action-btn"
          onClick={onEdit}
          aria-label={`Edit ${chore.name}`}
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          className="chore-card-action-btn chore-card-action-btn--danger"
          onClick={handleDeleteClick}
          aria-label={`Delete ${chore.name}`}
        >
          {confirmDelete ? (
            <span className="chore-card-action-confirm">Sure?</span>
          ) : (
            <Trash2 size={15} />
          )}
        </button>
      </div>

      {showMemberPicker && (
        <div className="modal-overlay" onClick={() => setShowMemberPicker(false)}>
          <div className="modal modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {pickerAction === 'claim' ? 'Who claims this?' : 'Who completed this?'}
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowMemberPicker(false)}
              >
                {'\u00D7'}
              </button>
            </div>
            <div className="modal-body">
              <div className="chores-assign-grid">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="chores-assign-btn"
                    onClick={() => handleMemberSelect(m.id)}
                    style={{ borderColor: m.color, backgroundColor: m.color + '15' }}
                  >
                    <span>{m.avatar}</span>
                    <span>{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChoresView() {
  const { members } = useFamily();
  const { settings } = useSettings();
  const {
    chores,
    addChore,
    updateChore,
    removeChore,
    completeChore,
    uncompleteChore,
    isChoreDone,
    getStreakForMember,
    getChoresForMember,
    getMemberProgress,
  } = useChores();

  const isShortScreen = useMediaQuery(SHORT_SCREEN_QUERY);
  const [viewRef, viewWidth] = useContentWidth<HTMLDivElement>();
  const columnsFit =
    members.length * MIN_COLUMN_WIDTH + (members.length - 1) * COLUMN_GAP <= viewWidth;
  const usePersonTabs = members.length > 1 && viewWidth > 0 && (isShortScreen || !columnsFit);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingChoreId, setEditingChoreId] = useState<string | null>(null);
  const [newChore, setNewChore] = useState({ ...EMPTY_CHORE_FORM });

  const isEditing = editingChoreId !== null;

  const openAddForm = (presetMemberId?: string) => {
    setNewChore({
      ...EMPTY_CHORE_FORM,
      assigned_to: presetMemberId ? [presetMemberId] : [],
    });
    setEditingChoreId(null);
    setShowForm(true);
  };

  const handleStartEdit = (chore: Chore) => {
    setNewChore({
      name: chore.name,
      value_cents: chore.value_cents,
      frequency: chore.frequency,
      assigned_to: [...chore.assigned_to],
      icon: chore.icon || '🧹',
    });
    setEditingChoreId(chore.id);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingChoreId(null);
    setNewChore({ ...EMPTY_CHORE_FORM });
  };

  const handleSaveChore = () => {
    if (!newChore.name.trim()) return;

    if (isEditing) {
      updateChore(editingChoreId, {
        name: newChore.name.trim(),
        value_cents: newChore.value_cents,
        frequency: newChore.frequency,
        assigned_to: newChore.assigned_to,
        icon: newChore.icon,
      });
    } else {
      addChore({
        name: newChore.name.trim(),
        value_cents: newChore.value_cents,
        frequency: newChore.frequency,
        assigned_to: newChore.assigned_to,
        icon: newChore.icon,
      });
    }

    handleCloseForm();
  };

  const handleDeleteChore = (id: string) => {
    removeChore(id);
    if (editingChoreId === id) {
      handleCloseForm();
    }
  };

  const toggleAssigned = (memberId: string) => {
    setNewChore((prev) => ({
      ...prev,
      assigned_to: prev.assigned_to.includes(memberId)
        ? prev.assigned_to.filter((id) => id !== memberId)
        : [...prev.assigned_to, memberId],
    }));
  };

  const memberChoreGroups = members.map((member) => ({
    member,
    chores: getChoresForMember(member.id),
    progress: getMemberProgress(member.id),
    streak: getStreakForMember(member.id),
  }));

  const unassignedChores = chores.filter((c) => c.assigned_to.length === 0);

  const handleClaimChore = (choreId: string, memberId: string) => {
    const chore = chores.find((c) => c.id === choreId);
    if (!chore) return;
    updateChore(choreId, {
      assigned_to: [...chore.assigned_to, memberId],
    });
  };

  const handleCompleteUnassigned = (choreId: string, memberId: string) => {
    completeChore(choreId, memberId);
  };

  const selectedGroup =
    memberChoreGroups.find((g) => g.member.id === selectedMemberId) ?? memberChoreGroups[0];

  const renderMemberCol = ({ member, chores: memberChores, progress, streak }: (typeof memberChoreGroups)[number]) => (
    <section key={member.id} className="chores-member-col">
      <div className="dash-member-header">
        <span
          className="dash-member-avatar"
          style={{ backgroundColor: member.color + '22', borderColor: member.color }}
        >
          {member.avatar}
        </span>
        <span className="dash-member-name" style={{ color: member.color }}>
          {member.name}
        </span>
        <StreakBadge streak={streak} size="sm" />
      </div>

      {memberChores.length > 0 && (
        <div className="chores-progress">
          <div className="chores-progress-bar">
            <div
              className="chores-progress-fill"
              style={{
                width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
                backgroundColor: member.color,
              }}
            />
          </div>
          <span className="chores-progress-text">
            {progress.completed}/{progress.total}
          </span>
        </div>
      )}

      <div className="chores-member-col-list">
        {memberChores.length === 0 ? (
          <div className="chores-member-empty">No chores assigned</div>
        ) : (
          <div className="chores-list">
            {memberChores.map((chore) => (
              <ChoreCard
                key={`${chore.id}-${member.id}`}
                chore={chore}
                member={member}
                isCompleted={isChoreDone(chore.id, member.id)}
                onComplete={() => completeChore(chore.id, member.id)}
                onUncomplete={() => uncompleteChore(chore.id, member.id)}
                onEdit={() => handleStartEdit(chore)}
                onDelete={() => handleDeleteChore(chore.id)}
                currencySymbol={settings.currencySymbol}
              />
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className="chores-member-add-btn"
        onClick={() => openAddForm(member.id)}
      >
        <Plus size={14} strokeWidth={2} />
        Add chore for {member.name}
      </button>
    </section>
  );

  return (
    <div className="chores-view" ref={viewRef}>
      <header className="chores-view-header">
        <h1 className="chores-view-title">Chores</h1>
        {members.length > 0 && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => openAddForm()}
          >
            <Plus size={16} strokeWidth={2} />
            Add Chore
          </button>
        )}
      </header>

      {members.length === 0 ? (
        <div className="chores-empty">
          Add family members first to assign chores.
        </div>
      ) : (
        <>
          {unassignedChores.length > 0 && (
            <section className="chores-unassigned-section">
              <h2 className="chores-section-title">Open Chores</h2>
              <div className="chores-unassigned-list">
                {unassignedChores.map((chore) => (
                  <UnassignedChoreCard
                    key={chore.id}
                    chore={chore}
                    members={members}
                    onClaim={handleClaimChore}
                    onComplete={handleCompleteUnassigned}
                    onEdit={() => handleStartEdit(chore)}
                    onDelete={() => handleDeleteChore(chore.id)}
                    currencySymbol={settings.currencySymbol}
                  />
                ))}
              </div>
            </section>
          )}

          {usePersonTabs && selectedGroup ? (
            <>
              <div className="chores-person-tabs" role="tablist" aria-label="Family members">
                {memberChoreGroups.map(({ member, progress, streak }) => (
                  <button
                    key={member.id}
                    type="button"
                    role="tab"
                    aria-selected={member.id === selectedGroup.member.id}
                    className={`chores-person-tab${member.id === selectedGroup.member.id ? ' chores-person-tab--active' : ''}`}
                    style={{ borderColor: member.id === selectedGroup.member.id ? member.color : undefined }}
                    onClick={() => setSelectedMemberId(member.id)}
                  >
                    <span
                      className="dash-member-avatar"
                      style={{ backgroundColor: member.color + '22', borderColor: member.color }}
                    >
                      {member.avatar}
                    </span>
                    <span className="chores-person-tab-name">{member.name}</span>
                    {progress.total > 0 && (
                      <span className="chores-person-tab-count">{progress.completed}/{progress.total}</span>
                    )}
                    <StreakBadge streak={streak} size="sm" />
                  </button>
                ))}
              </div>
              <div className="chores-family-grid chores-family-grid--single">
                {renderMemberCol(selectedGroup)}
              </div>
            </>
          ) : (
            <div className="chores-family-grid">
              {memberChoreGroups.map(renderMemberCol)}
            </div>
          )}
        </>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={handleCloseForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{isEditing ? 'Edit Chore' : 'New Chore'}</h2>
              <button type="button" className="modal-close" onClick={handleCloseForm}>
                {'\u00D7'}
              </button>
            </div>

            <div className="modal-body chores-add-form">
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
                  <span className="chores-value-prefix">
                    {settings.currencySymbol === STAR_CURRENCY ? STAR_CURRENCY : '$'}
                  </span>
                  <input
                    type="number"
                    className="form-input"
                    value={
                      settings.currencySymbol === STAR_CURRENCY
                        ? Math.round(newChore.value_cents / 100).toString()
                        : (newChore.value_cents / 100).toFixed(2)
                    }
                    onChange={(e) =>
                      setNewChore((f) => ({
                        ...f,
                        value_cents:
                          settings.currencySymbol === STAR_CURRENCY
                            ? Math.round(parseFloat(e.target.value || '0')) * 100
                            : Math.round(parseFloat(e.target.value || '0') * 100),
                      }))
                    }
                    step={settings.currencySymbol === STAR_CURRENCY ? '1' : '0.25'}
                    min="0"
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

              <div className="form-field">
                <label className="form-label">Assign To</label>
                <div className="chores-assign-grid">
                  {members.map((m: FamilyMember) => (
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
            </div>

            <div className="modal-footer">
              {isEditing && (
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => handleDeleteChore(editingChoreId)}
                >
                  Delete
                </button>
              )}
              <div className="modal-footer-right">
                <button type="button" className="btn btn--secondary" onClick={handleCloseForm}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleSaveChore}
                  disabled={!newChore.name.trim()}
                >
                  {isEditing ? 'Save Changes' : 'Add Chore'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
