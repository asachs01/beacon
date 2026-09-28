import { useEffect, useState, type FormEvent } from 'react';
import { getParentPinMembers, unlockDisplay, unlockParent, type BeaconSession } from '../api/beacon-auth';
import '../styles/auth.css';

interface ParentUnlockProps {
  mode: 'parent' | 'display';
  memberId?: string;
  onUnlocked: (session: BeaconSession) => void;
}

export function ParentUnlock({ mode, memberId, onUnlocked }: ParentUnlockProps) {
  const [pin, setPin] = useState('');
  const [parentId, setParentId] = useState('');
  const [parents, setParents] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode !== 'parent') return;
    let active = true;
    getParentPinMembers().then((list) => {
      if (active) setParents(list);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Could not load parent profiles');
    });
    return () => { active = false; };
  }, [mode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const session = mode === 'parent'
        ? await unlockParent(pin, parentId || undefined)
        : await unlockDisplay(pin, memberId ?? '');
      if (session.role !== mode) {
        // A display session uses the role name "display", not "child".
        throw new Error('Family server returned the wrong session role');
      }
      setPin('');
      onUnlocked(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify PIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <h1>{mode === 'parent' ? 'Parent access' : 'Kid Display'}</h1>
        <p>{mode === 'parent'
          ? 'Enter your parent PIN to manage Family and Home Assistant.'
          : 'Enter this family member’s PIN to open their display.'}</p>
        {mode === 'parent' && parents.length > 0 && (
          <label>
            PIN type
            <select value={parentId} onChange={(event) => { setParentId(event.target.value); setError(''); }}>
              <option value="">Configured parent PIN</option>
              {parents.map((parent) => <option value={parent.id} key={parent.id}>{parent.name}’s PIN</option>)}
            </select>
          </label>
        )}
        <label>
          {mode === 'parent' ? 'Parent PIN' : 'Member PIN'}
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(event) => { setPin(event.target.value.replace(/\D/g, '').slice(0, 8)); setError(''); }}
            minLength={mode === 'parent' && !parentId ? 6 : 4}
            maxLength={8}
            required
          />
        </label>
        {error && <p role="alert" className="auth-error">{error}</p>}
        <button type="submit" disabled={loading || pin.length < (mode === 'parent' && !parentId ? 6 : 4)}>
          {loading ? 'Verifying…' : 'Unlock'}
        </button>
      </form>
    </main>
  );
}
