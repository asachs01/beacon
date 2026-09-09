import { DashboardCardProps } from '../../types/dashboard-cards';
import { HaEntityState } from '../../api/ha-entity-store';
import { useHaEntities } from '../../hooks/useHaEntities';
import { readString, readStringArray } from './card-config';

function friendlyName(entity: HaEntityState, fallback: string): string {
  const name = entity.attributes.friendly_name;
  return typeof name === 'string' ? name : fallback;
}

/** Generic list-of-entities card, like Lovelace's "entities" card. */
export function HaEntitiesListCard({ config }: DashboardCardProps) {
  const entityIds = readStringArray(config, 'entity_ids');
  const title = readString(config, 'title', 'Entities');
  const subtitle = readString(config, 'subtitle');
  const entities = useHaEntities(entityIds);

  if (entityIds.length === 0) {
    return (
      <section className="dash-sidebar-section dash-ha-card">
        <h3 className="dash-sidebar-heading">{title}</h3>
        {subtitle && <div className="dash-ha-card-subtitle">{subtitle}</div>}
        <div className="dash-ha-card-empty">No entities selected — configure this card</div>
      </section>
    );
  }

  return (
    <section className="dash-sidebar-section dash-ha-card">
      <h3 className="dash-sidebar-heading">{title}</h3>
      {subtitle && <div className="dash-ha-card-subtitle">{subtitle}</div>}
      <ul className="dash-ha-entities-list">
        {entityIds.map((id) => {
          const entity = entities[id];
          return (
            <li key={id} className="dash-ha-entities-item">
              <span className="dash-ha-entities-name">{entity ? friendlyName(entity, id) : id}</span>
              <span className="dash-ha-entities-state">{entity ? entity.state : '—'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
