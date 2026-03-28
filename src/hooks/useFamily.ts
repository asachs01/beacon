import { useState, useCallback, useMemo, useEffect } from 'react';
import { FamilyStore } from '../api/family';
import { FamilyMember } from '../types/family';
import { HomeAssistantClient } from '../api/homeassistant';

export function useFamily(haClient?: () => HomeAssistantClient | null) {
  const store = useMemo(() => new FamilyStore(haClient), [haClient]);
  const [members, setMembers] = useState<FamilyMember[]>([]);

  const refresh = useCallback(() => {
    setMembers(store.getMembers());
  }, [store]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addMember = useCallback(
    (member: Omit<FamilyMember, 'id'>) => {
      store.addMember(member);
      refresh();
    },
    [store, refresh]
  );

  const updateMember = useCallback(
    (id: string, data: Partial<Omit<FamilyMember, 'id'>>) => {
      store.updateMember(id, data);
      refresh();
    },
    [store, refresh]
  );

  const removeMember = useCallback(
    (id: string) => {
      store.removeMember(id);
      refresh();
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
