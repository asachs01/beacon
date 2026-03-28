import { GroceryItem, GroceryList, MealPlanEntry } from '../types/grocery';
import { hasToken, getEntityState, callHaService } from './ha-rest';

const EMPTY_LIST: GroceryList = { id: 'grocy', name: 'Grocy Shopping List', items: [] };

/**
 * Grocy API client that works through Home Assistant's REST API.
 *
 * Uses HA's REST endpoints to read Grocy sensor states and call Grocy services.
 * If Grocy is not configured or entities are missing, all methods return empty
 * results gracefully.
 */
export class GrocyClient {
  private available: boolean | null = null;

  private async checkAvailability(): Promise<boolean> {
    if (this.available !== null) return this.available;

    const state = await getEntityState('sensor.grocy_shopping_list');
    this.available = state !== null;
    return this.available;
  }

  private async isReady(): Promise<boolean> {
    return hasToken() && await this.checkAvailability();
  }

  async getShoppingList(): Promise<GroceryList> {
    if (!(await this.isReady())) return EMPTY_LIST;

    try {
      const state = await getEntityState('sensor.grocy_shopping_list');
      if (!state) return EMPTY_LIST;

      const rawItems = (state.attributes.items ?? []) as Array<{
        id: number;
        product_id: number;
        note: string;
        amount: number;
        done: number;
        product_group?: string;
      }>;

      const items: GroceryItem[] = rawItems.map(item => ({
        id: String(item.id),
        name: item.note || `Product #${item.product_id}`,
        checked: item.done === 1,
        quantity: item.amount > 1 ? String(item.amount) : undefined,
        category: item.product_group,
      }));

      return { id: 'grocy', name: 'Grocy Shopping List', items };
    } catch (err) {
      console.warn('Beacon: Failed to fetch Grocy shopping list', err);
      return EMPTY_LIST;
    }
  }

  async addItem(name: string): Promise<void> {
    if (!(await this.isReady())) return;

    try {
      await callHaService('grocy', 'add_generic', {
        entity_type: 'shopping_list',
        data: { note: name, amount: 1 },
      });
    } catch (err) {
      console.warn('Beacon: Failed to add Grocy item', err);
    }
  }

  async checkItem(id: string): Promise<void> {
    if (!(await this.isReady())) return;

    try {
      await callHaService('grocy', 'execute_chore', {
        entity_type: 'shopping_list',
        entity_id: Number(id),
        data: { done: 1 },
      });
    } catch (err) {
      console.warn('Beacon: Failed to check Grocy item', err);
    }
  }

  async uncheckItem(id: string): Promise<void> {
    if (!(await this.isReady())) return;

    try {
      await callHaService('grocy', 'execute_chore', {
        entity_type: 'shopping_list',
        entity_id: Number(id),
        data: { done: 0 },
      });
    } catch (err) {
      console.warn('Beacon: Failed to uncheck Grocy item', err);
    }
  }

  async getExpiringProducts(days: number): Promise<GroceryItem[]> {
    if (!(await this.isReady())) return [];

    try {
      const state = await getEntityState('sensor.grocy_expiring_products');
      if (!state) return [];

      const rawProducts = (state.attributes.items ?? []) as Array<{
        id: number;
        name: string;
        best_before_date: string;
        amount: number;
      }>;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + days);

      return rawProducts
        .filter(p => new Date(p.best_before_date) <= cutoff)
        .map(p => ({
          id: String(p.id),
          name: p.name,
          checked: false,
          quantity: p.amount > 1 ? String(p.amount) : undefined,
          category: 'expiring',
        }));
    } catch (err) {
      console.warn('Beacon: Failed to fetch expiring products', err);
      return [];
    }
  }

  async getMealPlan(startDate: string, endDate: string): Promise<MealPlanEntry[]> {
    if (!(await this.isReady())) return [];

    try {
      const state = await getEntityState('sensor.grocy_meal_plan');
      if (!state) return [];

      const rawMeals = (state.attributes.items ?? []) as Array<{
        day: string;
        recipe: { name: string };
        section?: string;
        note?: string;
      }>;

      const start = new Date(startDate);
      const end = new Date(endDate);

      return rawMeals
        .filter(m => {
          const d = new Date(m.day);
          return d >= start && d <= end;
        })
        .map(m => ({
          date: m.day,
          meal_type: mapSectionToMealType(m.section),
          recipe_name: m.recipe?.name ?? 'Unknown',
          notes: m.note,
        }));
    } catch (err) {
      console.warn('Beacon: Failed to fetch Grocy meal plan', err);
      return [];
    }
  }

  resetAvailability(): void {
    this.available = null;
  }
}

function mapSectionToMealType(section?: string): 'breakfast' | 'lunch' | 'dinner' {
  if (!section) return 'dinner';
  const lower = section.toLowerCase();
  if (lower.includes('breakfast') || lower.includes('morning')) return 'breakfast';
  if (lower.includes('lunch') || lower.includes('noon')) return 'lunch';
  return 'dinner';
}
