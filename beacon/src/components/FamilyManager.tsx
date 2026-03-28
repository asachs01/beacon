import { useState } from 'react';
import { FamilyMember, MEMBER_COLORS, AVATAR_CATEGORIES } from '../types/family';

interface FamilyManagerProps {
  members: FamilyMember[];
  onAddMember: (member: Omit<FamilyMember, 'id'>) => void;
  onUpdateMember: (id: string, data: Partial<Omit<FamilyMember, 'id'>>) => void;
  onRemoveMember: (id: string) => void;
  onClose: () => void;
}

type FormMode = 'list' | 'add' | 'edit';

interface MemberForm {
  name: string;
  avatar: string;
  color: string;
  role: 'parent' | 'child';
  pin: string;
}

const EMPTY_FORM: MemberForm = {
  name: '',
  avatar: '🧑',
  color: MEMBER_COLORS[0],
  role: 'child',
  pin: '',
};

export function FamilyManager({
  members,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
  onClose,
}: FamilyManagerProps) {
  const [mode, setMode] = useState<FormMode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleEdit = (member: FamilyMember) => {
    setForm({
      name: member.name,
      avatar: member.avatar,
      color: member.color,
      role: member.role,
      pin: member.pin ?? '',
    });
    setEditingId(member.id);
    setMode('edit');
  };

  const handleAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setMode('add');
  };

  const handleSave = () => {
    if (!form.name.trim()) return;

    const data = {
      name: form.name.trim(),
      avatar: form.avatar,
      color: form.color,
      role: form.role,
      pin: form.pin || undefined,
    };

    if (mode === 'edit' && editingId) {
      onUpdateMember(editingId, data);
    } else {
      onAddMember(data);
    }

    setMode('list');
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      onRemoveMember(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const handleBack = () => {
    setMode('list');
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal family-manager" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">
            {mode === 'list' && 'Family Members'}
            {mode === 'add' && 'Add Member'}
            {mode === 'edit' && 'Edit Member'}
          </h2>
          <button type="button" className="modal-close" onClick={mode === 'list' ? onClose : handleBack}>
            {mode === 'list' ? '\u00D7' : '\u2190'}
          </button>
        </div>

        <div className="modal-body">
          {/* Member List */}
          {mode === 'list' && (
            <>
              <div className="fm-list">
                {members.length === 0 && (
                  <div className="fm-empty">No family members yet. Add someone to get started.</div>
                )}
                {members.map((member) => (
                  <div key={member.id} className="fm-card">
                    <span
                      className="fm-card-avatar"
                      style={{ backgroundColor: member.color + '22', borderColor: member.color }}
                    >
                      {member.avatar}
                    </span>
                    <div className="fm-card-info">
                      <span className="fm-card-name">{member.name}</span>
                      <span className={`fm-card-role fm-card-role--${member.role}`}>
                        {member.role}
                      </span>
                    </div>
                    <span className="fm-card-dot" style={{ backgroundColor: member.color }} />
                    <div className="fm-card-actions">
                      <button
                        type="button"
                        className="fm-btn-icon"
                        onClick={() => handleEdit(member)}
                        aria-label={`Edit ${member.name}`}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`fm-btn-icon fm-btn-icon--danger ${confirmDelete === member.id ? 'fm-btn-icon--confirm' : ''}`}
                        onClick={() => handleDelete(member.id)}
                        aria-label={`Delete ${member.name}`}
                      >
                        {confirmDelete === member.id ? (
                          <span className="fm-confirm-text">Confirm?</span>
                        ) : (
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn--primary fm-add-btn" onClick={handleAdd}>
                + Add Member
              </button>
            </>
          )}

          {/* Add / Edit Form */}
          {(mode === 'add' || mode === 'edit') && (
            <div className="fm-form">
              {/* Name */}
              <div className="form-field">
                <label className="form-label">Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Family member name"
                  autoFocus
                />
              </div>

              {/* Avatar Picker (categorized) */}
              <div className="form-field">
                <label className="form-label">Avatar</label>
                <div className="fm-avatar-picker">
                  {AVATAR_CATEGORIES.map((category) => (
                    <div key={category.label} className="fm-avatar-category">
                      <span className="fm-avatar-category-label">{category.label}</span>
                      <div className="fm-avatar-grid">
                        {category.emojis.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className={`fm-avatar-option ${form.avatar === emoji ? 'fm-avatar-option--selected' : ''}`}
                            onClick={() => setForm((f) => ({ ...f, avatar: emoji }))}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Color Picker */}
              <div className="form-field">
                <label className="form-label">Color</label>
                <div className="fm-color-grid">
                  {MEMBER_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`fm-color-option ${form.color === color ? 'fm-color-option--selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setForm((f) => ({ ...f, color }))}
                      aria-label={`Select color ${color}`}
                    />
                  ))}
                </div>
              </div>

              {/* Role */}
              <div className="form-field">
                <label className="form-label">Role</label>
                <div className="fm-role-toggle">
                  <button
                    type="button"
                    className={`fm-role-btn ${form.role === 'parent' ? 'fm-role-btn--active' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, role: 'parent' }))}
                  >
                    Parent
                  </button>
                  <button
                    type="button"
                    className={`fm-role-btn ${form.role === 'child' ? 'fm-role-btn--active' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, role: 'child' }))}
                  >
                    Child
                  </button>
                </div>
              </div>

              {/* PIN */}
              <div className="form-field">
                <label className="form-label">PIN (optional, 4-6 digits)</label>
                <input
                  type="password"
                  className="form-input"
                  value={form.pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setForm((f) => ({ ...f, pin: val }));
                  }}
                  placeholder="****"
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>

              {/* Save */}
              <div className="modal-footer">
                <button type="button" className="btn btn--secondary" onClick={handleBack}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleSave}
                  disabled={!form.name.trim()}
                >
                  {mode === 'edit' ? 'Save Changes' : 'Add Member'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
