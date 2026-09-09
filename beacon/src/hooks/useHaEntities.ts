import { useEffect, useState } from 'react';
import { HaEntitySnapshot, subscribeEntities } from '../api/ha-entity-store';

/** Subscribes to the shared HA entity poller for the given entities. */
export function useHaEntities(entityIds: string[]): HaEntitySnapshot {
  const [entities, setEntities] = useState<HaEntitySnapshot>({});
  const key = entityIds.join(',');

  useEffect(() => {
    if (!key) {
      setEntities({});
      return;
    }
    return subscribeEntities(key.split(','), setEntities);
  }, [key]);

  return entities;
}
