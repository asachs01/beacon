import { useEffect, useState } from 'react';
import { getIngressBasePath, isAddOn } from '../utils/ha-env';

/** Settings picker row. No state value and no other attributes. */
export interface HomeSensorCatalogEntity {
  entity_id: string;
  friendly_name: string | null;
  domain: string;
  device_class: string | null;
  unit: string | null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Keep the five catalog fields. Anything else in the payload is discarded. */
export function coerceHomeSensorCatalogEntity(row: unknown): HomeSensorCatalogEntity | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  if (typeof record.entity_id !== 'string' || !record.entity_id.includes('.')) return null;
  const domain = textOrNull(record.domain) ?? record.entity_id.slice(0, record.entity_id.indexOf('.'));
  if (!domain || domain === 'camera') return null;
  return {
    entity_id: record.entity_id,
    friendly_name: textOrNull(record.friendly_name),
    domain,
    device_class: textOrNull(record.device_class),
    unit: textOrNull(record.unit),
  };
}

export async function loadHomeSensorCatalog(): Promise<HomeSensorCatalogEntity[]> {
  let base = '';
  try {
    base = isAddOn() ? getIngressBasePath() : '';
  } catch {
    base = '';
  }
  const res = await fetch(`${base}/beacon-api/home-sensors/entities`);
  if (!res.ok) throw new Error('Home sensor catalog unavailable');
  const data = await res.json() as { entities?: unknown };
  if (!Array.isArray(data?.entities)) return [];
  return data.entities
    .map((row) => coerceHomeSensorCatalogEntity(row))
    .filter((row): row is HomeSensorCatalogEntity => row != null);
}

/** Entity names for Settings → Integrations. Does not open the state socket. */
export function useHomeSensorCatalog(): { entities: HomeSensorCatalogEntity[]; ready: boolean } {
  const [entities, setEntities] = useState<HomeSensorCatalogEntity[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadHomeSensorCatalog()
      .then((rows) => {
        if (cancelled) return;
        setEntities(rows);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setEntities([]);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { entities, ready };
}
