import { DashboardCardProps } from '../../types/dashboard-cards';
import { HaEntityState } from '../../api/ha-entity-store';
import { useHaEntities } from '../../hooks/useHaEntities';
import { readString } from './card-config';

function friendlyName(entity: HaEntityState | null, fallback: string): string {
  const name = entity?.attributes.friendly_name;
  return typeof name === 'string' ? name : fallback;
}

/** Generic single-entity state card, like Lovelace's "entity" card. */
export function HaEntityCard({ config }: DashboardCardProps) {
  const entityId = readString(config, 'entity_id');
  const title = readString(config, 'title');
  const subtitle = readString(config, 'subtitle');
  const entities = useHaEntities(entityId ? [entityId] : []);
  const entity = entities[entityId] ?? null;

  if (!entityId) {
    return (
      <section className="dash-sidebar-section dash-ha-card">
        {title && <h3 className="dash-sidebar-heading">{title}</h3>}
        {subtitle && <div className="dash-ha-card-subtitle">{subtitle}</div>}
        <div className="dash-ha-card-empty">No entity selected — configure this card</div>
      </section>
    );
  }

  const unit = entity?.attributes.unit_of_measurement;

  return (
    <section className="dash-sidebar-section dash-ha-card">
      <h3 className="dash-sidebar-heading">{title || friendlyName(entity, entityId)}</h3>
      {subtitle && <div className="dash-ha-card-subtitle">{subtitle}</div>}
      <div className="dash-ha-card-state">
        {entity ? entity.state : '—'}
        {typeof unit === 'string' && entity ? <span className="dash-ha-card-unit">{unit}</span> : null}
      </div>
    </section>
  );
}
