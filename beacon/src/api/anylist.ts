import { GroceryItem, GroceryList } from '../types/grocery';
import { getConfig } from '../config';

const config = getConfig();
const HA_TOKEN = config.ha_token;
function getHaUrl(): string {
  if (config.ha_url) return config.ha_url.replace(/\/$/, '');
  try { return window.parent.location.origin; } catch { return window.location.origin.replace(/^http:/, 'https:'); }
}
const HA_URL = getHaUrl();

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

  private async haFetch(path: string, options?: RequestInit): Promise<unknown> {
    const res = await fetch(`${HA_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    if (!res.ok) throw new Error(`HA API ${res.status}: ${res.statusText}`);
    return res.json();
  }

  private async callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.haFetch(`/api/services/${domain}/${service}`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    });
  }

  /**
   * Discover AnyList todo entities by fetching all states and filtering.
   */
  private async discoverEntities(): Promise<string[]> {
    if (this.entityIds !== null) return this.entityIds;

    try {
      const states = await this.haFetch('/api/states') as Array<{
        entity_id: string;
        state: string;
        attributes: Record<string, unknown>;
      }>;

      // AnyList creates todo.* entities without a prefix — include all todo entities
      this.entityIds = states
        .filter(s => s.entity_id.startsWith('todo.'))
        .map(s => s.entity_id);
    } catch {
      this.entityIds = [];
    }

    return this.entityIds;
  }

  async getLists(): Promise<GroceryList[]> {
    if (!HA_TOKEN) return [];

    const entityIds = await this.discoverEntities();
    if (entityIds.length === 0) return [];

    try {
      const states = await this.haFetch('/api/states') as Array<{
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
    if (!HA_TOKEN) return [];

    const entityIds = await this.discoverEntities();
    if (!entityIds.includes(listId)) return [];

    try {
      const result = await this.callService('todo', 'get_items', {
        entity_id: listId,
        return_response: true,
      }) as Array<{
        entity_id: string;
        state: string;
        attributes: Record<string, unknown>;
      }>;

      // HA REST API returns an array of entity states after service call.
      // For todo.get_items with return_response, the response format varies.
      // We try to parse the items from the response.
      const entity = Array.isArray(result)
        ? result.find(s => s.entity_id === listId)
        : null;

      if (!entity) {
        // Fallback: read the entity state directly for its items
        const state = await this.haFetch(`/api/states/${listId}`) as {
          entity_id: string;
          state: string;
          attributes: Record<string, unknown>;
        };

        const items = (state.attributes?.items ?? []) as Array<{
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

      const items = (entity.attributes?.items ?? []) as Array<{
        uid: string;
        summary: string;
        status: string;
      }>;

      return items.map(item => ({
        id: item.uid,
        name: item.summary,
        checked: item.status === 'completed',
      }));
    } catch (err) {
      console.warn('Beacon: Failed to fetch AnyList items', err);
      return [];
    }
  }

  async addItem(listId: string, name: string): Promise<void> {
    if (!HA_TOKEN) return;

    const entityIds = await this.discoverEntities();
    if (!entityIds.includes(listId)) return;

    try {
      await this.callService('todo', 'add_item', {
        entity_id: listId,
        item: name,
      });
    } catch (err) {
      console.warn('Beacon: Failed to add AnyList item', err);
    }
  }

  async checkItem(listId: string, itemId: string): Promise<void> {
    if (!HA_TOKEN) return;

    try {
      await this.callService('todo', 'update_item', {
        entity_id: listId,
        item: itemId,
        status: 'completed',
      });
    } catch (err) {
      console.warn('Beacon: Failed to check AnyList item', err);
    }
  }

  async uncheckItem(listId: string, itemId: string): Promise<void> {
    if (!HA_TOKEN) return;

    try {
      await this.callService('todo', 'update_item', {
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
