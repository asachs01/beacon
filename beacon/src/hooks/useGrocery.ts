import { useState, useEffect, useCallback, useRef } from 'react';
import { GroceryItem, GroceryList } from '../types/grocery';
import { GrocyClient } from '../api/grocy';
import { AnyListClient } from '../api/anylist';

export type GrocerySource = 'grocy' | 'anylist' | 'none';

interface UseGroceryResult {
  list: GroceryList | null;
  source: GrocerySource;
  loading: boolean;
  addItem: (name: string) => Promise<void>;
  checkItem: (id: string) => Promise<void>;
  uncheckItem: (id: string) => Promise<void>;
  expiringItems: GroceryItem[];
  refresh: () => Promise<void>;
}

/**
 * Unified grocery hook. Tries Grocy first, then AnyList, returns the first
 * source that has data. If neither is configured, returns null with source 'none'.
 */
export function useGrocery(connected: boolean): UseGroceryResult {
  const [list, setList] = useState<GroceryList | null>(null);
  const [source, setSource] = useState<GrocerySource>('none');
  const [loading, setLoading] = useState(false);
  const [expiringItems, setExpiringItems] = useState<GroceryItem[]>([]);

  const grocyRef = useRef(new GrocyClient());
  const anylistRef = useRef(new AnyListClient());
  const anylistEntityRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!connected) return;

    setLoading(true);

    try {
      // Try Grocy first
      const grocyList = await grocyRef.current.getShoppingList();
      if (grocyList.items.length > 0) {
        setList(grocyList);
        setSource('grocy');

        const expiring = await grocyRef.current.getExpiringProducts(3);
        setExpiringItems(expiring);

        setLoading(false);
        return;
      }

      // Fall back to AnyList
      const anylistLists = await anylistRef.current.getLists();
      if (anylistLists.length > 0) {
        const primaryList = anylistLists[0];
        const items = await anylistRef.current.getItems(primaryList.id);
        anylistEntityRef.current = primaryList.id;

        setList({ ...primaryList, items });
        setSource('anylist');
        setExpiringItems([]);
        setLoading(false);
        return;
      }

      // Neither available
      setList(null);
      setSource('none');
      setExpiringItems([]);
    } catch (err) {
      console.warn('Beacon: Grocery fetch failed', err);
      setList(null);
      setSource('none');
    } finally {
      setLoading(false);
    }
  }, [connected]);

  // Fetch on connect
  useEffect(() => {
    if (connected) {
      refresh();
    }
  }, [connected, refresh]);

  // Refresh every 2 minutes
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(refresh, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [connected, refresh]);

  const addItem = useCallback(async (name: string) => {
    if (source === 'grocy') {
      await grocyRef.current.addItem(name);
    } else if (source === 'anylist' && anylistEntityRef.current) {
      await anylistRef.current.addItem(anylistEntityRef.current, name);
    }
    await refresh();
  }, [source, refresh]);

  const checkItem = useCallback(async (id: string) => {
    // Optimistic update
    setList(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(item =>
          item.id === id ? { ...item, checked: true } : item,
        ),
      };
    });

    if (source === 'grocy') {
      await grocyRef.current.checkItem(id);
    } else if (source === 'anylist' && anylistEntityRef.current) {
      await anylistRef.current.checkItem(anylistEntityRef.current, id);
    }
  }, [source]);

  const uncheckItem = useCallback(async (id: string) => {
    // Optimistic update
    setList(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(item =>
          item.id === id ? { ...item, checked: false } : item,
        ),
      };
    });

    if (source === 'grocy') {
      await grocyRef.current.uncheckItem(id);
    } else if (source === 'anylist' && anylistEntityRef.current) {
      await anylistRef.current.uncheckItem(anylistEntityRef.current, id);
    }
  }, [source]);

  return { list, source, loading, addItem, checkItem, uncheckItem, expiringItems, refresh };
}
