import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GrocyClient, indexProductNames, resolveGrocyItemName } from './grocy';
import { callHaService, getEntityState, hasToken } from './ha-rest';
import { subscribeToasts } from '../ui/toast';

vi.mock('./ha-rest', () => ({
  hasToken: vi.fn(),
  getEntityState: vi.fn(),
  callHaService: vi.fn(),
}));

const mockHasToken = vi.mocked(hasToken);
const mockGetEntityState = vi.mocked(getEntityState);
const mockCallHaService = vi.mocked(callHaService);

const SHOPPING_LIST = {
  entity_id: 'sensor.grocy_shopping_list',
  state: '1',
  attributes: { products: [] },
};

describe('Grocy shopping-list writes', () => {
  beforeEach(() => {
    mockHasToken.mockReset();
    mockGetEntityState.mockReset();
    mockCallHaService.mockReset();
    mockHasToken.mockReturnValue(true);
    mockGetEntityState.mockImplementation(async (entityId) => (
      entityId === 'sensor.grocy_shopping_list' ? SHOPPING_LIST : null
    ));
    mockCallHaService.mockResolvedValue(undefined);
  });

  it('checks an item by setting done on the shopping list, not by adding stock', async () => {
    await new GrocyClient().checkItem('12');

    expect(mockCallHaService).toHaveBeenCalledTimes(1);
    expect(mockCallHaService).toHaveBeenCalledWith('grocy', 'update_generic', {
      entity_type: 'shopping_list',
      object_id: 12,
      data: { done: 1 },
    });
  });

  it('unchecks an item by clearing the shopping-list done flag', async () => {
    await new GrocyClient().uncheckItem('12');

    expect(mockCallHaService).toHaveBeenCalledWith('grocy', 'update_generic', {
      entity_type: 'shopping_list',
      object_id: 12,
      data: { done: 0 },
    });
  });

  it('adds a note row with add_generic and does not purchase the product', async () => {
    await new GrocyClient().addItem('Oat milk');

    expect(mockCallHaService).toHaveBeenCalledWith('grocy', 'add_generic', {
      entity_type: 'shopping_list',
      data: { note: 'Oat milk', amount: 1 },
    });
  });

  it('toasts and rethrows when a write fails', async () => {
    mockCallHaService.mockRejectedValue(new Error('service unavailable'));
    const notices: string[] = [];
    const unsubscribe = subscribeToasts((notice) => notices.push(notice.messageKey));

    await expect(new GrocyClient().checkItem('4')).rejects.toThrow('service unavailable');

    expect(notices).toEqual(['grocery.grocyWriteFailed']);
    unsubscribe();
  });
});

describe('Grocy product names', () => {
  it('prefers the shopping-list product name, then stock, then the note, then Product #id', () => {
    const stock = indexProductNames({
      products: [{ id: 3, name: 'Oats' }],
    });

    expect(resolveGrocyItemName({
      id: 1,
      product_id: 8,
      product: { name: 'Milk' },
      note: 'weekly',
    }, stock)).toBe('Milk');

    expect(resolveGrocyItemName({ id: 2, product_id: 3, note: '' }, stock)).toBe('Oats');
    expect(resolveGrocyItemName({ id: 9, note: 'paper towels' })).toBe('paper towels');
    expect(resolveGrocyItemName({ id: 9, product_id: 9 })).toBe('Product #9');
  });
});
