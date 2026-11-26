import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeSensorsSettings } from './HomeSensorsSettings';

vi.mock('../api/home-sensor-catalog', () => ({
  useHomeSensorCatalog: () => ({
    ready: true,
    entities: [
      { entity_id: 'sensor.kitchen_temp', friendly_name: 'Kitchen', domain: 'sensor', device_class: 'temperature', unit: '°F' },
      { entity_id: 'camera.porch', friendly_name: 'Porch camera', domain: 'camera', device_class: null, unit: null },
      { entity_id: 'binary_sensor.garage_door', friendly_name: 'Garage', domain: 'binary_sensor', device_class: 'garage', unit: null },
    ],
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
