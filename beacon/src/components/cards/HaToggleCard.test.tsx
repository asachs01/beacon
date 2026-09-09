import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HaToggleCard } from './HaToggleCard';
import { DashboardCardContext } from '../../types/dashboard-cards';
import { HaEntitySnapshot, subscribeEntities } from '../../api/ha-entity-store';
import { callHaService } from '../../api/ha-rest';

vi.mock('../../api/ha-entity-store', () => ({
  subscribeEntities: vi.fn(),
  refreshEntities: vi.fn(async () => {}),
}));

vi.mock('../../api/ha-rest', () => ({
  callHaService: vi.fn(async () => ({})),
}));

const mockSubscribeEntities = vi.mocked(subscribeEntities);
const mockCallHaService = vi.mocked(callHaService);

function entity(entityId: string, state: string, friendlyName?: string) {
  return {
    entity_id: entityId,
    state,
    attributes: friendlyName ? { friendly_name: friendlyName } : {},
  };
}

/** Serves a fixed snapshot to the card, standing in for the shared poller. */
function withEntities(snapshot: HaEntitySnapshot) {
  mockSubscribeEntities.mockImplementation((entityIds, listener) => {
    const visible: HaEntitySnapshot = {};
    entityIds.forEach((id) => {
      if (snapshot[id]) visible[id] = snapshot[id];
    });
    listener(visible);
    return () => {};
  });
}

const context = {} as DashboardCardContext;

beforeEach(() => {
  mockSubscribeEntities.mockReset();
  mockCallHaService.mockReset();
  mockCallHaService.mockResolvedValue({});
  withEntities({});
});

describe('HaToggleCard', () => {
  it('renders a switch per configured entity', () => {
    withEntities({
      'light.kitchen': entity('light.kitchen', 'on', 'Kitchen'),
      'switch.fan': entity('switch.fan', 'off', 'Fan'),
    });

    render(<HaToggleCard config={{ entity_ids: ['light.kitchen', 'switch.fan'] }} context={context} />);

    expect(screen.getByRole('button', { name: /Kitchen/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Fan/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('still works for cards saved before multiple entities were supported', () => {
    withEntities({ 'light.kitchen': entity('light.kitchen', 'on', 'Kitchen') });

    render(<HaToggleCard config={{ entity_id: 'light.kitchen' }} context={context} />);

    expect(screen.getByRole('button', { name: /Kitchen/ })).toBeInTheDocument();
  });

  it('prompts for configuration when no entity is selected', () => {
    render(<HaToggleCard config={{ entity_ids: [] }} context={context} />);

    expect(screen.getByText(/configure this card/i)).toBeInTheDocument();
  });

  it('calls the toggle service for the clicked entity only', async () => {
    withEntities({
      'light.kitchen': entity('light.kitchen', 'off', 'Kitchen'),
      'switch.fan': entity('switch.fan', 'off', 'Fan'),
    });
    render(<HaToggleCard config={{ entity_ids: ['light.kitchen', 'switch.fan'] }} context={context} />);

    await userEvent.click(screen.getByRole('button', { name: /Kitchen/ }));

    expect(mockCallHaService).toHaveBeenCalledExactlyOnceWith('light', 'toggle', { entity_id: 'light.kitchen' });
  });

  it('shows the new state immediately while the service call is in flight', async () => {
    withEntities({ 'light.kitchen': entity('light.kitchen', 'off', 'Kitchen') });
    let resolveService: (value: unknown) => void = () => {};
    mockCallHaService.mockImplementation(() => new Promise((resolve) => { resolveService = resolve; }));
    render(<HaToggleCard config={{ entity_ids: ['light.kitchen'] }} context={context} />);
    const toggle = screen.getByRole('button', { name: /Kitchen/ });

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toBeDisabled();
    resolveService({});
  });

  it('rolls back to the real state when the service call fails', async () => {
    withEntities({ 'light.kitchen': entity('light.kitchen', 'off', 'Kitchen') });
    mockCallHaService.mockRejectedValue(new Error('Service call 502'));
    render(<HaToggleCard config={{ entity_ids: ['light.kitchen'] }} context={context} />);
    const toggle = screen.getByRole('button', { name: /Kitchen/ });

    await userEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'false'));
    expect(toggle).toBeEnabled();
  });

  it('disables a switch whose entity has not been reported yet', () => {
    render(<HaToggleCard config={{ entity_ids: ['light.missing'] }} context={context} />);

    expect(screen.getByRole('button', { name: /light.missing/ })).toBeDisabled();
  });
});
