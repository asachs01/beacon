import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroceryView } from './GroceryView';
import { ToastHost } from './ToastHost';
import { callHaService, getEntityState, haFetch, hasToken } from '../api/ha-rest';

vi.mock('../api/ha-rest', () => ({
  hasToken: vi.fn(() => true),
  getEntityState: vi.fn(),
  callHaService: vi.fn(),
  haFetch: vi.fn(),
}));

const mockHasToken = vi.mocked(hasToken);
const mockGetEntityState = vi.mocked(getEntityState);
const mockCallHaService = vi.mocked(callHaService);
const mockHaFetch = vi.mocked(haFetch);

const HA_LISTS = [
  {
    entity_id: 'todo.groceries',
    state: '1',
    attributes: { friendly_name: 'Groceries' },
  },
];

const SHOPPING_LIST = {
  entity_id: 'sensor.grocy_shopping_list',
  state: '1',
  attributes: {
    products: [{ id: 7, note: 'Milk', done: 0, amount: 1 }],
  },
};

function renderGrocery(grocyEnabled: boolean) {
  return render(
    <>
      <GroceryView
        mode="grocery"
        groceryListIds={['todo.groceries']}
        grocyEnabled={grocyEnabled}
        connected
      />
      <ToastHost />
    </>,
  );
}

describe('Grocery screen Grocy list', () => {
  beforeEach(() => {
    mockHasToken.mockReset();
    mockGetEntityState.mockReset();
    mockCallHaService.mockReset();
    mockHaFetch.mockReset();
    mockHasToken.mockReturnValue(true);
    mockHaFetch.mockResolvedValue(HA_LISTS);
    mockGetEntityState.mockImplementation(async (entityId) => (
      entityId === 'sensor.grocy_shopping_list' ? SHOPPING_LIST : null
    ));
    mockCallHaService.mockImplementation(async (domain, service) => {
      if (domain === 'todo' && service === 'get_items') {
        return {
          service_response: {
            'todo.groceries': {
              items: [{ uid: 'ha-1', summary: 'Eggs', status: 'needs_action' }],
            },
          },
        };
      }
      return {};
    });
  });

  it('checks a Grocy item with update_generic and does not call the HA todo service', async () => {
    const user = userEvent.setup();
    renderGrocery(true);

    expect(await screen.findByRole('option', { name: 'Grocy' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Groceries (HA)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Shopping List' })).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Milk' }));

    expect(mockCallHaService).toHaveBeenCalledWith('grocy', 'update_generic', {
      entity_type: 'shopping_list',
      object_id: 7,
      data: { done: 1 },
    });
    expect(mockCallHaService.mock.calls.some((call) => call[0] === 'todo')).toBe(false);
    expect(mockCallHaService.mock.calls.some((call) => String(call[1]).includes('stock'))).toBe(false);
  });

  it('adds a Grocy item with add_generic', async () => {
    const user = userEvent.setup();
    renderGrocery(true);

    await screen.findByRole('button', { name: 'Milk' });
    await user.type(screen.getByPlaceholderText('Add an item...'), 'Bread');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(mockCallHaService).toHaveBeenCalledWith('grocy', 'add_generic', {
      entity_type: 'shopping_list',
      data: { note: 'Bread', amount: 1 },
    });
    expect(mockCallHaService.mock.calls.some((call) => call[0] === 'todo')).toBe(false);
  });

  it('shows the failure toast from the Grocery screen when a Grocy write fails', async () => {
    const user = userEvent.setup();
    mockCallHaService.mockImplementation(async (domain, service) => {
      if (domain === 'grocy') throw new Error('service unavailable');
      if (domain === 'todo' && service === 'get_items') return { service_response: {} };
      return {};
    });
    renderGrocery(true);

    await user.click(await screen.findByRole('button', { name: 'Milk' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      "Couldn't update the Grocy shopping list.",
    );
    expect(screen.getByRole('button', { name: 'Milk' })).not.toHaveClass('grocery-view-item--checked');
  });

  it('leaves the Grocery screen on Home Assistant lists when Grocy is off', async () => {
    const user = userEvent.setup();
    renderGrocery(false);

    expect(await screen.findByRole('option', { name: 'Shopping List' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Groceries (HA)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Grocy' })).not.toBeInTheDocument();
    expect(mockGetEntityState).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByRole('combobox'), 'todo.groceries');
    await user.click(await screen.findByRole('button', { name: 'Eggs' }));

    expect(mockCallHaService).toHaveBeenCalledWith('todo', 'update_item', {
      entity_id: 'todo.groceries',
      item: 'Eggs',
      status: 'completed',
    });
    expect(mockCallHaService.mock.calls.some((call) => call[0] === 'grocy')).toBe(false);
  });
});
