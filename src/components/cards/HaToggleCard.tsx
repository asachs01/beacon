import { useState } from 'react';
import { DashboardCardProps } from '../../types/dashboard-cards';
import { callHaService } from '../../api/ha-rest';
import { refreshEntities } from '../../api/ha-entity-store';
import { useHaEntities } from '../../hooks/useHaEntities';
import { readEntityIds, readString } from './card-config';

/** Toggle card for light/switch entities, like Lovelace's toggle rows. */
export function HaToggleCard({ config }: DashboardCardProps) {
  const entityIds = readEntityIds(config, 'entity_ids', 'entity_id');
  const title = readString(config, 'title');
  const subtitle = readString(config, 'subtitle');
  const entities = useHaEntities(entityIds);
  // Entities mid-toggle, shown optimistically until Home Assistant confirms.
  const [optimisticStates, setOptimisticStates] = useState<Record<string, string>>({});
  const [pendingEntityIds, setPendingEntityIds] = useState<string[]>([]);

  const handleToggle = async (entityId: string) => {
    const entity = entities[entityId];
    if (!entity) return;

    setOptimisticStates((previous) => ({ ...previous, [entityId]: entity.state === 'on' ? 'off' : 'on' }));
    setPendingEntityIds((previous) => [...previous, entityId]);
    try {
      await callHaService(entityId.split('.')[0], 'toggle', { entity_id: entityId });
      await refreshEntities([entityId]);
    } catch {
      // Roll back rather than leave the switch showing a state HA never reached.
    } finally {
      setOptimisticStates(({ [entityId]: _confirmed, ...rest }) => rest);
      setPendingEntityIds((previous) => previous.filter((id) => id !== entityId));
    }
  };

  if (entityIds.length === 0) {
    return (
      <section className="dash-sidebar-section dash-ha-card">
        {title && <h3 className="dash-sidebar-heading">{title}</h3>}
        {subtitle && <div className="dash-ha-card-subtitle">{subtitle}</div>}
        <div className="dash-ha-card-empty">No entity selected — configure this card</div>
      </section>
    );
  }

  return (
    <section className="dash-sidebar-section dash-ha-card">
      {title && <h3 className="dash-sidebar-heading">{title}</h3>}
      {subtitle && <div className="dash-ha-card-subtitle">{subtitle}</div>}
      <div className="dash-ha-toggle-list">
        {entityIds.map((entityId) => {
          const entity = entities[entityId];
          const isOn = (optimisticStates[entityId] ?? entity?.state) === 'on';
          const name = typeof entity?.attributes.friendly_name === 'string'
            ? entity.attributes.friendly_name
            : entityId;
          return (
            <button
              key={entityId}
              type="button"
              className={`dash-ha-toggle ${isOn ? 'dash-ha-toggle--on' : ''}`}
              onClick={() => handleToggle(entityId)}
              disabled={pendingEntityIds.includes(entityId) || !entity}
              aria-pressed={isOn}
            >
              <span className="dash-ha-toggle-name">{name}</span>
              <span className="dash-ha-toggle-switch" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
