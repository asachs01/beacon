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

function isoDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

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
        attributes: {
          expiring_products: [{ id: 1, name: 'Yogurt', best_before_date: isoDaysFromToday(1) }],
        },
      };
    });

    render(<GrocyExpiringCard enabled />);

    expect(await screen.findByRole('heading', { name: 'Expiring' })).toBeInTheDocument();
    expect(screen.getByText('Yogurt')).toBeInTheDocument();
  });

  it('shows only products whose best_before_date is within 3 days', async () => {
    mockGetEntityState.mockImplementation(async (entityId) => {
      if (entityId !== 'binary_sensor.grocy_expiring_products') return null;
      return {
        entity_id: entityId,
        state: 'on',
        attributes: {
          expiring_products: [
            { id: 1, name: 'Milk', best_before_date: isoDaysFromToday(1) },
            { id: 2, name: 'Rice', best_before_date: isoDaysFromToday(10) },
            { id: 3, name: 'Mystery' },
          ],
        },
      };
    });

    render(<GrocyExpiringCard enabled />);

    expect(await screen.findByText('Milk')).toBeInTheDocument();
    expect(screen.queryByText('Rice')).not.toBeInTheDocument();
    expect(screen.queryByText('Mystery')).not.toBeInTheDocument();
  });

  it('keeps the card, with no far-dated names, when the sensor exists but nothing is due within 3 days', async () => {
    mockGetEntityState.mockImplementation(async (entityId) => {
      if (entityId !== 'binary_sensor.grocy_expiring_products') return null;
      return {
        entity_id: entityId,
        state: 'on',
        attributes: {
          expiring_products: [{ id: 2, name: 'Rice', best_before_date: isoDaysFromToday(10) }],
        },
      };
    });

    render(<GrocyExpiringCard enabled />);

    expect(await screen.findByRole('heading', { name: 'Expiring' })).toBeInTheDocument();
    expect(screen.getByText('Nothing expiring soon')).toBeInTheDocument();
    expect(screen.queryByText('Rice')).not.toBeInTheDocument();
  });

  it('uses the older sensor id and still applies the 3-day filter', async () => {
    mockGetEntityState.mockImplementation(async (entityId) => {
      if (entityId !== 'sensor.grocy_expiring_products') return null;
      return {
        entity_id: entityId,
        state: 'on',
        attributes: {
          expiring_products: [
            { id: 1, name: 'Milk', best_before_date: isoDaysFromToday(2) },
            { id: 2, name: 'Rice', best_before_date: isoDaysFromToday(9) },
          ],
        },
      };
    });

    render(<GrocyExpiringCard enabled />);

    expect(await screen.findByText('Milk')).toBeInTheDocument();
    expect(screen.queryByText('Rice')).not.toBeInTheDocument();
    expect(mockGetEntityState).toHaveBeenCalledWith('binary_sensor.grocy_expiring_products');
    expect(mockGetEntityState).toHaveBeenCalledWith('sensor.grocy_expiring_products');
  });

  it('hides the low-stock card when the missing-products sensor is absent', async () => {
    render(<GrocyMissingCard enabled />);
    await waitFor(() => {
      expect(mockGetEntityState).toHaveBeenCalledWith('binary_sensor.grocy_missing_products');
    });
    expect(screen.queryByRole('heading', { name: 'Low stock' })).not.toBeInTheDocument();
  });
});
