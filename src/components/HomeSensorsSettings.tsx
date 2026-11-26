import { useMemo, useState } from 'react';
import { useHomeSensorCatalog } from '../api/home-sensor-catalog';
import { filterHomeSensorChoices } from '../home-sensors/entities';
import type { HomeSensorPick } from '../home-sensors/types';
import { useTranslation } from '../i18n';

interface HomeSensorsSettingsProps {
  enabled: boolean;
  sensors: HomeSensorPick[];
  onChange: (patch: { homeSensorsEnabled?: boolean; homeSensors?: HomeSensorPick[] }) => void;
}

/**
 * Settings → Integrations → Home sensors. The entity list comes from
 * GET /beacon-api/home-sensors/entities (names and classes, not states).
 * Cameras are left out. The card itself stays read-only and uses the
 * filtered state socket.
 */
export function HomeSensorsSettings({ enabled, sensors, onChange }: HomeSensorsSettingsProps) {
  const { t } = useTranslation();
  const { entities, ready } = useHomeSensorCatalog();
  const [search, setSearch] = useState('');
  const choices = useMemo(
    () => filterHomeSensorChoices(entities, search),
    [entities, search],
  );
  const pickedIds = new Set(sensors.map((sensor) => sensor.entityId));
  const visibleIds = new Set(choices.map((choice) => choice.entityId));
  const selectedOffscreen = sensors.filter((sensor) => !visibleIds.has(sensor.entityId));

  const updatePick = (entityId: string, patch: Partial<HomeSensorPick>) => {
    onChange({
      homeSensors: sensors.map((sensor) => (
        sensor.entityId === entityId ? { ...sensor, ...patch } : sensor
      )),
    });
  };

  const toggle = (entityId: string) => {
    if (pickedIds.has(entityId)) {
      onChange({ homeSensors: sensors.filter((sensor) => sensor.entityId !== entityId) });
      return;
    }
    onChange({ homeSensors: [...sensors, { entityId, name: '', icon: '' }] });
  };

  return (
    <div className="settings-group">
      <div className="settings-group-title">{t('settings.integrations.homeSensorsTitle')}</div>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t('settings.integrations.homeSensorsLabel')}</div>
          <div className="settings-row-sublabel">{t('settings.integrations.homeSensorsSublabel')}</div>
        </div>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={enabled}
            aria-label={t('settings.integrations.homeSensorsLabel')}
            onChange={(event) => onChange({ homeSensorsEnabled: event.target.checked })}
          />
          <span className="settings-toggle-track" />
          <span className="settings-toggle-thumb" />
        </label>
      </div>
      <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
        <div>
          <div className="settings-row-label">{t('settings.integrations.homeSensorsListLabel')}</div>
          <div className="settings-row-sublabel">{t('settings.integrations.homeSensorsListSublabel')}</div>
        </div>
        <input
          className="settings-input"
          type="search"
          value={search}
          placeholder={t('settings.integrations.homeSensorsSearch')}
          aria-label={t('settings.integrations.homeSensorsSearch')}
          onChange={(event) => setSearch(event.target.value)}
        />
        {!ready ? (
          <div className="settings-row-sublabel">{t('settings.integrations.homeSensorsLoading')}</div>
        ) : choices.length === 0 && selectedOffscreen.length === 0 ? (
          <div className="settings-row-sublabel">{t('settings.integrations.homeSensorsEmpty')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedOffscreen.map((sensor) => (
              <div key={sensor.entityId} className="dash-home-sensor-edit">
                  <label className="dash-card-picker-entity-option">
                    <input
                      type="checkbox"
                      checked
                      aria-label={sensor.name || sensor.entityId}
                      onChange={() => toggle(sensor.entityId)}
                    />
                  <span>{sensor.name || sensor.entityId}</span>
                </label>
                <div className="settings-row-sublabel">{sensor.entityId}</div>
              </div>
            ))}
            {choices.map((choice) => {
              const picked = sensors.find((sensor) => sensor.entityId === choice.entityId);
              return (
                <div key={choice.entityId} className="dash-home-sensor-edit">
                  <label className="dash-card-picker-entity-option">
                    <input
                      type="checkbox"
                      checked={!!picked}
                      aria-label={choice.label}
                      onChange={() => toggle(choice.entityId)}
                    />
                    <span>{choice.label}</span>
                    <span className="settings-row-sublabel">{choice.entityId}</span>
                  </label>
                  {picked && (
                    <div className="dash-home-sensor-edit-fields">
                      <input
                        className="settings-input"
                        type="text"
                        value={picked.name}
                        placeholder={t('settings.integrations.homeSensorsNamePlaceholder')}
                        aria-label={t('settings.integrations.homeSensorsNamePlaceholder')}
                        onChange={(event) => updatePick(choice.entityId, { name: event.target.value })}
                      />
                      <input
                        className="settings-input"
                        type="text"
                        value={picked.icon}
                        placeholder={t('settings.integrations.homeSensorsIconPlaceholder')}
                        aria-label={t('settings.integrations.homeSensorsIconPlaceholder')}
                        maxLength={8}
                        onChange={(event) => updatePick(choice.entityId, { icon: event.target.value })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
