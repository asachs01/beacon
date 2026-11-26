import type { TranslationKey } from '../../i18n';
import { useTranslation } from '../../i18n';
import { useHomeSensorStream } from '../../api/home-sensor-stream';
import { readHomeSensor, type HomeSensorReadout } from '../../home-sensors/format';
import { isExcludedHomeSensor } from '../../home-sensors/entities';
import { homeSensorsCardVisible } from '../../home-sensors/settings';
import type { HaLiveState, HomeSensorPick } from '../../home-sensors/types';
import type { DashboardCardProps } from '../../types/dashboard-cards';

function statusKey(readout: HomeSensorReadout): { key: TranslationKey; count?: number } | null {
  if (readout.kind === 'unavailable') return { key: 'cards.homeSensors.unavailable' };
  if (readout.kind === 'unknown') return { key: 'cards.homeSensors.unknown' };
  if (readout.kind === 'stale' && readout.unit === 'h') {
    return { key: 'cards.homeSensors.staleHours', count: readout.count };
  }
  if (readout.kind === 'stale' && readout.unit === 'd') {
    return { key: 'cards.homeSensors.staleDays', count: readout.count };
  }
  if (readout.kind === 'stale') return { key: 'cards.homeSensors.staleMinutes', count: readout.count };
  return null;
}

function displayName(pick: HomeSensorPick, live: HaLiveState | undefined): string {
  if (pick.name.trim()) return pick.name.trim();
  const friendly = live?.attributes.friendly_name;
  if (typeof friendly === 'string' && friendly.trim()) return friendly.trim();
  return pick.entityId;
}

/**
 * Read-only list of the entities chosen in Settings → Integrations.
 * States come from the Home Assistant websocket (get_states, then
 * state_changed). There are no toggles and no service calls.
 */
export function HomeSensorsCard({ context }: DashboardCardProps) {
  const { t } = useTranslation();
  const visible = homeSensorsCardVisible({
    enabled: context.homeSensorsEnabled === true,
    guestActive: context.guestActive === true,
    kidDisplay: context.kidDisplay === true,
  });
  const { entities, ready } = useHomeSensorStream(visible);

  if (!visible) return null;

  const picks = (context.homeSensors ?? []).filter((pick) => !isExcludedHomeSensor(pick.entityId));
  const byId = new Map(entities.map((entity) => [entity.entity_id, entity]));

  return (
    <section className="dash-sidebar-section dash-ha-card dash-home-sensors" aria-label={t('cards.homeSensors.title')}>
      <h3 className="dash-sidebar-heading">{t('cards.homeSensors.title')}</h3>
      {picks.length === 0 ? (
        <div className="dash-ha-card-empty">{t('cards.homeSensors.empty')}</div>
      ) : !ready ? (
        <div className="dash-ha-card-empty">{t('cards.homeSensors.loading')}</div>
      ) : (
        <ul className="dash-home-sensor-list">
          {picks.map((pick) => {
            const live = byId.get(pick.entityId);
            const readout = live
              ? readHomeSensor(live, context.now.getTime())
              : { kind: 'unavailable' as const };
            const status = statusKey(readout);
            const name = displayName(pick, live);
            return (
              <li key={pick.entityId} className="dash-home-sensor-row">
                {pick.icon ? <span className="dash-home-sensor-icon" aria-hidden="true">{pick.icon}</span> : null}
                <span className="dash-home-sensor-name">{name}</span>
                {status ? (
                  <span className="dash-home-sensor-status">
                    {t(status.key, status.count != null ? { count: status.count } : undefined)}
                  </span>
                ) : (
                  <span className="dash-home-sensor-value">
                    {readout.kind === 'value' ? readout.text : ''}
                    {readout.kind === 'value' && readout.unit ? (
                      <span className="dash-ha-card-unit">{readout.unit}</span>
                    ) : null}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
