import { useState, useCallback, useMemo, useEffect } from 'react';
import { FamilyStore, notifyFamilyDataChanged, onFamilyDataChanged } from '../api/family';
import { saveThen } from '../utils/save-errors';
import { unlessUnchanged } from '../utils/same-data';
import { FamilyMember } from '../types/family';

export function useFamily() {
  const store = useMemo(() => new FamilyStore(), []);
  // Start with localStorage data immediately, then update from server
  const [members, setMembers] = useState<FamilyMember[]>(() => store.getMembersSync());

  const refresh = useCallback(async () => {
    const m = await store.getMembers();
    setMembers((prev) => unlessUnchanged(prev, m));
  }, [store]);

  useEffect(() => {
    refresh();
    return onFamilyDataChanged(store, () => void refresh());
  }, [refresh, store]);

  const addMember = useCallback(
    async (member: Omit<FamilyMember, 'id'>) => {
      await saveThen(() => store.addMember(member), async () => {
        await refresh();
        notifyFamilyDataChanged(store);
      });
    },
    [store, refresh]
  );

  const updateMember = useCallback(
    async (id: string, data: Partial<Omit<FamilyMember, 'id'>>) => {
      await saveThen(() => store.updateMember(id, data), async () => {
        await refresh();
        notifyFamilyDataChanged(store);
      });
    },
    [store, refresh]
  );

  const removeMember = useCallback(
    async (id: string) => {
      await saveThen(() => store.removeMember(id), async () => {
        await refresh();
        notifyFamilyDataChanged(store);
      });
    },
    [store, refresh]
  );

  const getMemberById = useCallback(
    (id: string) => members.find((m) => m.id === id) ?? null,
    [members]
  );

  return {
    members,
    addMember,
    updateMember,
    removeMember,
    getMemberById,
    refresh,
  };
}
