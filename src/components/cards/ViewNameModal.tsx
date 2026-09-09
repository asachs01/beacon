import { useState } from 'react';

interface ViewNameModalProps {
  title: string;
  initialValue: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

/** Small text-input modal used for adding/renaming a dashboard view (tab). */
export function ViewNameModal({ title, initialValue, onSave, onClose }: ViewNameModalProps) {
  const [name, setName] = useState(initialValue);

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="modal-body">
          <div className="form-field">
            <label className="form-label" htmlFor="view-name-input">Name</label>
            <input
              id="view-name-input"
              className="form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              autoFocus
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn--primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
