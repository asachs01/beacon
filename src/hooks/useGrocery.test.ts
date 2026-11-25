import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGrocery } from './useGrocery';

const grocy = vi.hoisted(() => ({
  getShoppingList: vi.fn(),
  getExpiringProducts: vi.fn(),
  addItem: vi.fn(),
  checkItem: vi.fn(),
  uncheckItem: vi.fn(),
}));

const anylist = vi.hoisted(() => ({
  getLists: vi.fn(),
  getItems: vi.fn(),
  addItem: vi.fn(),
  checkItem: vi.fn(),
  uncheckItem: vi.fn(),
}));

vi.mock('../api/grocy', () => ({
  GrocyClient: class {
    getShoppingList() { return grocy.getShoppingList(); }
    getExpiringProducts(days: number) { return grocy.getExpiringProducts(days); }
    addItem(name: string) { return grocy.addItem(name); }
    checkItem(id: string) { return grocy.checkItem(id); }
    uncheckItem(id: string) { return grocy.uncheckItem(id); }
  },
}));

vi.mock('../api/anylist', () => ({
  AnyListClient: class {
    getLists() { return anylist.getLists(); }
    getItems(id: string) { return anylist.getItems(id); }
    addItem(id: string, name: string) { return anylist.addItem(id, name); }
    checkItem(listId: string, id: string) { return anylist.checkItem(listId, id); }
    uncheckItem(listId: string, id: string) { return anylist.uncheckItem(listId, id); }
  },
}));

const EMPTY_GROCY = { id: 'grocy', name: 'Grocy Shopping List', items: [] };
const ANYLIST = [{ id: 'todo.anylist_groceries', name: 'Groceries' }];

describe('useGrocery source', () => {
  beforeEach(() => {
    grocy.getShoppingList.mockReset();
    grocy.getExpiringProducts.mockReset();
    grocy.checkItem.mockReset();
    grocy.getExpiringProducts.mockResolvedValue([]);
    anylist.getLists.mockReset();
    anylist.getItems.mockReset();
    grocy.getShoppingList.mockResolvedValue(EMPTY_GROCY);
    anylist.getLists.mockResolvedValue(ANYLIST);
    anylist.getItems.mockResolvedValue([{ id: 'a', name: 'Milk', checked: false }]);
  });

  it('keeps an empty Grocy list when Grocy is enabled', async () => {
    const { result } = renderHook(() => useGrocery(true, true));

    await waitFor(() => expect(result.current.source).toBe('grocy'));

    expect(result.current.list?.items).toEqual([]);
    expect(anylist.getLists).not.toHaveBeenCalled();
  });

  it('falls back to AnyList when Grocy is off and its list is empty', async () => {
    const { result } = renderHook(() => useGrocery(true, false));

    await waitFor(() => expect(result.current.source).toBe('anylist'));
    expect(result.current.list?.items.map((item) => item.name)).toEqual(['Milk']);
  });

  it('puts the check back and leaves the toast to the client when a write fails', async () => {
    grocy.getShoppingList.mockResolvedValue({
      id: 'grocy',
      name: 'Grocy Shopping List',
      items: [{ id: '1', name: 'Milk', checked: false }],
    });
    grocy.checkItem.mockRejectedValue(new Error('service unavailable'));

    const { result } = renderHook(() => useGrocery(true, true));
    await waitFor(() => expect(result.current.list?.items).toHaveLength(1));

    await act(async () => {
      await result.current.checkItem('1');
    });

    expect(result.current.list?.items[0].checked).toBe(false);
    expect(grocy.checkItem).toHaveBeenCalledWith('1');
  });
});
