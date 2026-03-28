import { GroceryItem, GroceryList } from '../types/grocery';
import { hasToken, haFetch, callHaService } from './ha-rest';

/**
 * AnyList integration via Home Assistant's REST API and todo entities.
 *
 * AnyList has no official public API. When the AnyList HA integration is
 * installed, it exposes todo.anylist_* entities. This client uses HA's
 * REST API to call the todo service on those entities.
 *
 * If no AnyList entities are found, all methods return empty results gracefully.
 */
export class AnyListClient {
  private entityIds: string[] | null = null;

  /**
   * Discover AnyList todo entities by fetching all states and filtering.
   */
  private async discoverEntities(): Promise<string[]> {
    if (this.entityIds !== null) return this.entityIds;

    try {
      const states = await haFetch('/api/states') as Array<{
        entity_id: string;
        state: string;
        attributes: Record<string, unknown>;
      }>;

      this.entityIds = states
        .filter(s => s.entity_id.startsWith('todo.'))
        .map(s => s.entity_id);
    } catch {
      this.entityIds = [];
    }

    return this.entityIds;
  }

  async getLists(): Promise<GroceryList[]> {
    if (!hasToken()) return [];

    const entityIds = await this.discoverEntities();
    if (entityIds.length === 0) return [];

    try {
      const states = await haFetch('/api/states') as Array<{
        entity_id: string;
        state: string;
        attributes: Record<string, unknown>;
      }>;

      return entityIds.map(entityId => {
        const entity = states.find(s => s.entity_id === entityId);
        const friendlyName = (entity?.attributes?.friendly_name as string)
          ?? entityId.replace('todo.', '').replace(/_/g, ' ');

        return {
          id: entityId,
          name: friendlyName,
          items: [],
        };
      });
    } catch (err) {
      console.warn('Beacon: Failed to fetch AnyList lists', err);
      return [];
    }
  }

  async getItems(listId: string): Promise<GroceryItem[]> {
    if (!hasToken()) return [];

    const entityIds = await this.discoverEntities();
    if (!entityIds.includes(listId)) return [];

    try {
      const result = await callHaService('todo', 'get_items', {
        entity_id: listId,
        return_response: true,
      }) as Array<{
        entity_id: string;
        state: string;
        attributes: Record<string, unknown>;
      }>;

      // HA REST API returns an array of entity states after service call.
      // For todo.get_items with return_response, the response format varies.
      const entity = Array.isArray(result)
        ? result.find(s => s.entity_id === listId)
        : null;

      if (!entity) {
        // Fallback: read the entity state directly for its items
        const state = await haFetch(`/api/states/${listId}`) as {
          entity_id: string;
          state: string;
          attributes: Record<string, unknown>;
        };

        return parseTodoItems(state.attributes?.items);
      }

      return parseTodoItems(entity.attributes?.items);
    } catch (err) {
      console.warn('Beacon: Failed to fetch AnyList items', err);
      return [];
    }
  }

  async addItem(listId: string, name: string): Promise<void> {
    if (!hasToken()) return;

    const entityIds = await this.discoverEntities();
    if (!entityIds.includes(listId)) return;

    try {
      await callHaService('todo', 'add_item', {
        entity_id: listId,
        item: name,
      });
    } catch (err) {
      console.warn('Beacon: Failed to add AnyList item', err);
    }
  }

  async checkItem(listId: string, itemId: string): Promise<void> {
    if (!hasToken()) return;

    try {
      await callHaService('todo', 'update_item', {
        entity_id: listId,
        item: itemId,
        status: 'completed',
      });
    } catch (err) {
      console.warn('Beacon: Failed to check AnyList item', err);
    }
  }

  async uncheckItem(listId: string, itemId: string): Promise<void> {
    if (!hasToken()) return;

    try {
      await callHaService('todo', 'update_item', {
        entity_id: listId,
        item: itemId,
        status: 'needs_action',
      });
    } catch (err) {
      console.warn('Beacon: Failed to uncheck AnyList item', err);
    }
  }

  resetEntities(): void {
    this.entityIds = null;
  }
}

function parseTodoItems(raw: unknown): GroceryItem[] {
  const items = (raw ?? []) as Array<{
    uid: string;
    summary: string;
    status: string;
  }>;

  return items.map(item => ({
    id: item.uid,
    name: item.summary,
    checked: item.status === 'completed',
  }));
}
