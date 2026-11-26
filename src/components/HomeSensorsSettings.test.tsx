import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeSensorsSettings } from './HomeSensorsSettings';
import type { HaLiveState } from '../home-sensors/types';

vi.mock('../api/home-sensor-stream', () => ({
  useHomeSensorStream: () => ({
    ready: true,
    failed: false,
    entities: [
      { entity_id: 'sensor.kitchen_temp', state: '70', attributes: { friendly_name: 'Kitchen' } },
      { entity_id: 'camera.porch', state: 'idle', attributes: { friendly_name: 'Porch camera' } },
      { entity_id: 'binary_sensor.garage_door', state: 'off', attributes: { friendly_name: 'Garage' } },
    ] satisfies HaLiveState[],
  }),
}));

describe('Home sensors settings', () => {
  it('starts off and lists only entities the connection returned', async () => {
    const onChange = vi.fn();
    render(<HomeSensorsSettings enabled={false} sensors={[]} onChange={onChange} />);

    expect(screen.getByRole('checkbox', { name: 'Home sensors card' })).not.toBeChecked();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.queryByText('Porch camera')).not.toBeInTheDocument();
    expect(screen.queryByText('camera.porch')).not.toBeInTheDocument();
    expect(screen.queryByText('weather.home')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Kitchen' }));
    expect(onChange).toHaveBeenCalledWith({
      homeSensors: [{ entityId: 'sensor.kitchen_temp', name: '', icon: '' }],
    });
  });

  it('searches within the returned entities', async () => {
    render(<HomeSensorsSettings enabled={false} sensors={[]} onChange={() => {}} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search entities' }), 'garage');
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.queryByText('Kitchen')).not.toBeInTheDocument();
    expect(screen.queryByText('Porch camera')).not.toBeInTheDocument();
  });
});
