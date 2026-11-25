import { useEffect, useState } from 'react';
import { GrocyClient, type GrocySensorRead } from '../../api/grocy';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n';

interface GrocyStatusCardProps {
  enabled: boolean;
  titleKey: TranslationKey;
  emptyKey: TranslationKey;
  load: (client: GrocyClient) => Promise<GrocySensorRead>;
}

/**
 * Sidebar card for one Grocy product sensor. Off until its setting is on.
 * Renders nothing when that sensor is not in Home Assistant.
 */
export function GrocyStatusCard({ enabled, titleKey, emptyKey, load }: GrocyStatusCardProps) {
  const { t } = useTranslation();
  const [read, setRead] = useState<GrocySensorRead | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRead(null);
      return undefined;
    }
    let cancelled = false;
    const client = new GrocyClient();
    load(client).then((next) => {
      if (!cancelled) setRead(next);
    }).catch(() => {
      if (!cancelled) setRead({ present: false, items: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, load]);

  if (!enabled || !read?.present) return null;

  return (
    <section className="dash-sidebar-section">
      <h3 className="dash-sidebar-heading">{t(titleKey)}</h3>
      {read.items.length === 0 ? (
        <div className="dash-sidebar-empty">{t(emptyKey)}</div>
      ) : (
        <ul className="task-checklist">
          {read.items.map((item) => (
            <li key={item.id || item.name} className="task-checklist-item">
              <span className="task-checklist-label">
                <span className="task-checklist-name">{item.name}</span>
                {item.quantity && <span className="chore-card-value">{item.quantity}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const loadExpiring = (client: GrocyClient) => client.readExpiringProducts();
const loadMissing = (client: GrocyClient) => client.readMissingProducts();

export function GrocyExpiringCard({ enabled }: { enabled: boolean }) {
  return (
    <GrocyStatusCard
      enabled={enabled}
      titleKey="cards.grocyExpiring.title"
      emptyKey="cards.grocyExpiring.empty"
      load={loadExpiring}
    />
  );
}

export function GrocyMissingCard({ enabled }: { enabled: boolean }) {
  return (
    <GrocyStatusCard
      enabled={enabled}
      titleKey="cards.grocyMissing.title"
      emptyKey="cards.grocyMissing.empty"
      load={loadMissing}
    />
  );
}
