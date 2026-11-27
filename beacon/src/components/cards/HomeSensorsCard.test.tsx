import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeSensorsCard } from './HomeSensorsCard';
import type { DashboardCardContext } from '../../types/dashboard-cards';
import type { HaLiveState } from '../../home-sensors/types';
import { HOME_SENSOR_STALE_MS } from '../../home-sensors/format';

const enabledFlags: boolean[] = [];

const NOW = new Date('2026-11-25T15:00:00.000Z');

function live(overrides: Partial<HaLiveState> & { entity_id: string; state: string }): HaLiveState {
  return {
    attributes: {},
    last_updated: NOW.toISOString(),
    ...overrides,
  };
}

vi.mock('../../api/home-sensor-stream', () => ({
  useHomeSensorStream: (enabled: boolean) => {
    enabledFlags.push(enabled);
    if (!enabled) return { entities: [], ready: false, failed: false };
    const entities: HaLiveState[] = [
      live({
        entity_id: 'sensor.kitchen',
        state: '70',
        attributes: { friendly_name: 'Kitchen', unit_of_measurement: '°F' },
        last_updated: new Date(NOW.getTime() - HOME_SENSOR_STALE_MS).toISOString(),
      }),
      live({
        entity_id: 'binary_sensor.garage',
        state: 'on',
        attributes: { friendly_name: 'Garage', device_class: 'garage_door' },
      }),
      live({ entity_id: 'sensor.washer', state: 'unavailable', attributes: { friendly_name: 'Washer' } }),
    ];
    return { entities, ready: true, failed: false };
  },
}));

function renderCard(overrides: Partial<DashboardCardContext> = {}) {
  enabledFlags.length = 0;
  return render(
    <HomeSensorsCard
      config={{}}
      context={{
        now: NOW,
        homeSensorsEnabled: true,
        guestActive: false,
        kidDisplay: false,
        homeSensors: [
          { entityId: 'sensor.kitchen', name: '', icon: '🌡️' },
          { entityId: 'binary_sensor.garage', name: 'Garage door', icon: '' },
          { entityId: 'sensor.washer', name: 'Washer', icon: '' },
        ],
        ...overrides,
      } as DashboardCardContext}
    />,
  );
}

describe('Home sensors card', () => {
  it('shows stale and unavailable text instead of the old value', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: 'Home sensors' })).toBeInTheDocument();
    expect(screen.getByText('No update in 3 h')).toBeInTheDocument();
    expect(screen.queryByText('70')).not.toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(enabledFlags).toEqual([true]);
  });

  it('hides the card from guests and does not subscribe', () => {
    renderCard({ guestActive: true });
    expect(screen.queryByRole('heading', { name: 'Home sensors' })).not.toBeInTheDocument();
    expect(screen.queryByText('Open')).not.toBeInTheDocument();
    expect(enabledFlags).toEqual([false]);
  });

  it('stays off until the setting is enabled', () => {
    renderCard({ homeSensorsEnabled: false });
    expect(screen.queryByText('Home sensors')).not.toBeInTheDocument();
    expect(enabledFlags).toEqual([false]);
  });

  it('stays off on Kid Display', () => {
    renderCard({ kidDisplay: true });
    expect(screen.queryByText('Open')).not.toBeInTheDocument();
    expect(enabledFlags).toEqual([false]);
  });
});
