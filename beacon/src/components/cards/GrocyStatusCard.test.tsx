import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GrocyExpiringCard, GrocyMissingCard } from './GrocyStatusCard';
import { getEntityState } from '../../api/ha-rest';

vi.mock('../../api/ha-rest', () => ({
  hasToken: () => true,
  getEntityState: vi.fn(),
  callHaService: vi.fn(),
}));

const mockGetEntityState = vi.mocked(getEntityState);

describe('Grocy status cards', () => {
  beforeEach(() => {
    mockGetEntityState.mockReset();
    mockGetEntityState.mockResolvedValue(null);
  });

  it('hides the expiring card when the setting is off', () => {
    render(<GrocyExpiringCard enabled={false} />);
    expect(screen.queryByRole('heading', { name: 'Expiring' })).not.toBeInTheDocument();
    expect(mockGetEntityState).not.toHaveBeenCalled();
  });

  it('hides the expiring card when the sensor is missing', async () => {
    render(<GrocyExpiringCard enabled />);
    await waitFor(() => {
      expect(mockGetEntityState).toHaveBeenCalledWith('binary_sensor.grocy_expiring_products');
    });
    expect(screen.queryByRole('heading', { name: 'Expiring' })).not.toBeInTheDocument();
  });

  it('shows product names when the expiring sensor exists', async () => {
    mockGetEntityState.mockImplementation(async (entityId) => {
      if (entityId !== 'binary_sensor.grocy_expiring_products') return null;
      return {
        entity_id: entityId,
        state: 'on',
        attributes: { expiring_products: [{ id: 1, name: 'Yogurt' }] },
      };
    });

    render(<GrocyExpiringCard enabled />);

    expect(await screen.findByRole('heading', { name: 'Expiring' })).toBeInTheDocument();
    expect(screen.getByText('Yogurt')).toBeInTheDocument();
  });

  it('hides the low-stock card when the missing-products sensor is absent', async () => {
    render(<GrocyMissingCard enabled />);
    await waitFor(() => {
      expect(mockGetEntityState).toHaveBeenCalledWith('binary_sensor.grocy_missing_products');
    });
    expect(screen.queryByRole('heading', { name: 'Low stock' })).not.toBeInTheDocument();
  });
});
