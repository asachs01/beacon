import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntityPicker, invalidateEntityOptions } from './EntityPicker';
import { PRIVILEGE_DOMAINS } from '../../api/chore-privileges';

vi.mock('../../api/ha-rest', () => ({
  getAllEntityStates: vi.fn(async () => [
    { entity_id: 'switch.wifi', state: 'off', attributes: { friendly_name: 'Wi-Fi' } },
    { entity_id: 'input_boolean.allow', state: 'off', attributes: { friendly_name: 'Allow' } },
    { entity_id: 'light.lamp', state: 'off', attributes: { friendly_name: 'Lamp' } },
    { entity_id: 'fan.room', state: 'off', attributes: { friendly_name: 'Fan' } },
    { entity_id: 'sensor.temp', state: '20', attributes: { friendly_name: 'Temp' } },
  ]),
}));

describe('EntityPicker domain filter', () => {
  beforeEach(() => {
    invalidateEntityOptions();
  });

  it('limits the privilege picker to switch, input_boolean, light, and fan', async () => {
    render(
      <EntityPicker
        id="privilege"
        value=""
        domains={PRIVILEGE_DOMAINS}
        onChange={() => {}}
      />,
    );

    expect(await screen.findByRole('option', { name: 'Wi-Fi (switch.wifi)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Allow (input_boolean.allow)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Lamp (light.lamp)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Fan (fan.room)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Temp (sensor.temp)' })).not.toBeInTheDocument();

    const domainFilter = screen.getByLabelText('Filter by domain');
    expect(domainFilter).toHaveTextContent('switch');
    expect(domainFilter).toHaveTextContent('input_boolean');
    expect(domainFilter).toHaveTextContent('light');
    expect(domainFilter).toHaveTextContent('fan');
    expect(domainFilter).not.toHaveTextContent('sensor');
  });
});
