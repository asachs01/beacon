import { GroceryItem, GroceryList, MealPlanEntry } from '../types/grocery';
import { hasToken, getEntityState, callHaService } from './ha-rest';
import { showToast } from '../ui/toast';

const EMPTY_LIST: GroceryList = { id: 'grocy', name: 'Grocy Shopping List', items: [] };

/**
 * Shopping list and stock are sensors. Expiring and missing products are
 * binary sensors in the current HACS integration (name "Grocy expiring
 * products" / "Grocy missing products"). The sensor.* ids are kept so an
 * older entity id still resolves.
 *
 * https://github.com/custom-components/grocy/blob/c7863c2ecc96cf24cb29cb823e7ac5cadf2d0070/custom_components/grocy/sensor.py#L96-L118
 * https://github.com/custom-components/grocy/blob/c7863c2ecc96cf24cb29cb823e7ac5cadf2d0070/custom_components/grocy/binary_sensor.py#L76-L104
 */
export const GROCY_SHOPPING_LIST_ENTITY = 'sensor.grocy_shopping_list';
export const GROCY_STOCK_ENTITY = 'sensor.grocy_stock';
export const GROCY_EXPIRING_ENTITIES = [
  'binary_sensor.grocy_expiring_products',
  'sensor.grocy_expiring_products',
] as const;
export const GROCY_MISSING_ENTITIES = [
  'binary_sensor.grocy_missing_products',
  'sensor.grocy_missing_products',
] as const;

const SHOPPING_LIST_KEYS = ['products', 'items'] as const;
const EXPIRING_KEYS = ['expiring_products', 'products', 'items'] as const;
const MISSING_KEYS = ['missing_products', 'products', 'items'] as const;

export interface GrocySensorRead {
  /** False when none of the candidate entities exist in Home Assistant. */
  present: boolean;
  items: GroceryItem[];
}

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

    const state = await getEntityState(GROCY_SHOPPING_LIST_ENTITY);
    this.available = state !== null;
    return this.available;
  }

  private async isReady(): Promise<boolean> {
    return hasToken() && await this.checkAvailability();
  }

  async getShoppingList(): Promise<GroceryList> {
    if (!(await this.isReady())) return EMPTY_LIST;

    try {
      const state = await getEntityState(GROCY_SHOPPING_LIST_ENTITY);
      if (!state) return EMPTY_LIST;

      const names = await this.productNamesById();
      const rawItems = readGrocyList(state.attributes, SHOPPING_LIST_KEYS);

      const items: GroceryItem[] = rawItems.map(item => ({
        id: String(item.id),
        name: resolveGrocyItemName(item, names),
        checked: grocyItemChecked(item.done),
        quantity: typeof item.amount === 'number' && item.amount > 1 ? String(item.amount) : undefined,
        category: text(item.product_group) || undefined,
      }));

      return { id: 'grocy', name: 'Grocy Shopping List', items };
    } catch (err) {
      console.warn('Beacon: Failed to fetch Grocy shopping list', err);
      return EMPTY_LIST;
    }
  }

  /**
   * Adds a note row to the shopping list. Does not purchase or stock the product.
   * grocy.add_generic → POST objects/shopping_list with { note, amount }.
   */
  async addItem(name: string): Promise<void> {
    if (!(await this.isReady())) return;

    await this.write('add_generic', {
      entity_type: 'shopping_list',
      data: { note: name, amount: 1 },
    }, 'Beacon: Failed to add Grocy item');
  }

  /**
   * Sets the shopping-list row's done flag. Does not add the product to stock.
   * grocy.update_generic → PUT objects/shopping_list/{id} with { done }.
   */
  async checkItem(id: string): Promise<void> {
    if (!(await this.isReady())) return;
    await this.write('update_generic', shoppingListDonePayload(id, 1), 'Beacon: Failed to check Grocy item');
  }

  async uncheckItem(id: string): Promise<void> {
    if (!(await this.isReady())) return;
    await this.write('update_generic', shoppingListDonePayload(id, 0), 'Beacon: Failed to uncheck Grocy item');
  }

  async getExpiringProducts(days: number): Promise<GroceryItem[]> {
    if (!(await this.isReady())) return [];

    try {
      const found = await firstEntity(GROCY_EXPIRING_ENTITIES);
      if (!found) return [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + days);
      return readGrocyList(found.attributes, EXPIRING_KEYS)
        .filter((item) => {
          const raw = text(item.best_before_date);
          if (!raw) return false;
          return new Date(raw) <= cutoff;
        })
        .map((item) => toProductItem(item, 'expiring'));
    } catch (err) {
      console.warn('Beacon: Failed to fetch expiring products', err);
      return [];
    }
  }

  /** Every product on the expiring sensor. `present` is false when the sensor is absent. */
  async readExpiringProducts(): Promise<GrocySensorRead> {
    return this.readProductSensor(GROCY_EXPIRING_ENTITIES, EXPIRING_KEYS, 'expiring');
  }

  async readMissingProducts(): Promise<GrocySensorRead> {
    return this.readProductSensor(GROCY_MISSING_ENTITIES, MISSING_KEYS, 'missing');
  }

  async getMealPlan(startDate: string, endDate: string): Promise<MealPlanEntry[]> {
    if (!(await this.isReady())) return [];

    try {
      const state = await getEntityState('sensor.grocy_meal_plan');
      if (!state) return [];

      const rawMeals = readGrocyList(state.attributes, ['meals', 'items']);

      const start = new Date(startDate);
      const end = new Date(endDate);

      return rawMeals
        .filter(m => {
          const day = text(m.day);
          if (!day) return false;
          const d = new Date(day);
          return d >= start && d <= end;
        })
        .map(m => {
          const recipe = asRecord(m.recipe);
          return {
            date: text(m.day),
            meal_type: mapSectionToMealType(text(m.section)),
            recipe_name: text(recipe?.name) || 'Unknown',
            notes: text(m.note) || undefined,
          };
        });
    } catch (err) {
      console.warn('Beacon: Failed to fetch Grocy meal plan', err);
      return [];
    }
  }

  resetAvailability(): void {
    this.available = null;
  }

  private async write(service: string, data: Record<string, unknown>, label: string): Promise<void> {
    try {
      await callHaService('grocy', service, data);
    } catch (err) {
      console.warn(label, err);
      showToast('grocery.grocyWriteFailed');
      throw err;
    }
  }

  private async productNamesById(): Promise<Map<string, string>> {
    try {
      const state = await getEntityState(GROCY_STOCK_ENTITY);
      if (!state) return new Map();
      return indexProductNames(state.attributes);
    } catch (err) {
      console.warn('Beacon: Failed to fetch Grocy stock', err);
      return new Map();
    }
  }

  private async readProductSensor(
    entityIds: readonly string[],
    keys: readonly string[],
    category: string,
  ): Promise<GrocySensorRead> {
    const found = await firstEntity(entityIds);
    if (!found) return { present: false, items: [] };
    const items = readGrocyList(found.attributes, keys).map((item) => toProductItem(item, category));
    return { present: true, items };
  }
}

function toProductItem(item: Record<string, unknown>, category: string): GroceryItem {
  return {
    id: String(item.id ?? item.product_id ?? ''),
    name: resolveGrocyItemName(item),
    checked: false,
    quantity: quantityLabel(item),
    category,
  };
}

/** Payload for grocy.update_generic. `done` is the shopping-list flag, not a stock change. */
export function shoppingListDonePayload(id: string, done: 0 | 1): Record<string, unknown> {
  return {
    entity_type: 'shopping_list',
    object_id: Number(id),
    data: { done },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function idKey(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return text(value);
}

export function readGrocyList(
  attributes: Record<string, unknown> | undefined,
  keys: readonly string[],
): Array<Record<string, unknown>> {
  if (!attributes) return [];
  for (const key of keys) {
    const value = attributes[key];
    if (!Array.isArray(value)) continue;
    return value
      .map(asRecord)
      .filter((item): item is Record<string, unknown> => item !== null);
  }
  return [];
}

export function indexProductNames(attributes: Record<string, unknown> | undefined): Map<string, string> {
  const names = new Map<string, string>();
  for (const item of readGrocyList(attributes, ['products', 'items'])) {
    const id = idKey(item.id) || idKey(item.product_id);
    const name = resolveGrocyItemName(item);
    if (!id || !name || name.startsWith('Product #')) continue;
    names.set(id, name);
  }
  return names;
}

/**
 * Product name from the shopping-list row (product details) or the stock
 * sensor, then the note, then "Product #id".
 */
export function resolveGrocyItemName(
  item: Record<string, unknown>,
  namesByProductId: ReadonlyMap<string, string> = new Map(),
): string {
  const product = asRecord(item.product);
  const fromProduct = text(product?.name) || text(item.product_name);
  if (fromProduct) return fromProduct;
  const productId = idKey(item.product_id);
  const fromStock = productId ? namesByProductId.get(productId) : undefined;
  if (fromStock) return fromStock;
  const ownName = text(item.name);
  if (ownName) return ownName;
  const note = text(item.note);
  if (note) return note;
  const fallback = productId || idKey(item.id) || '?';
  return `Product #${fallback}`;
}

export function grocyItemChecked(done: unknown): boolean {
  return done === 1 || done === true || done === '1';
}

async function firstEntity(entityIds: readonly string[]) {
  for (const entityId of entityIds) {
    const state = await getEntityState(entityId);
    if (state) return state;
  }
  return null;
}

function quantityLabel(item: Record<string, unknown>): string | undefined {
  const amount = typeof item.amount === 'number'
    ? item.amount
    : typeof item.amount_missing === 'number'
      ? item.amount_missing
      : undefined;
  return amount !== undefined && amount > 1 ? String(amount) : undefined;
}

function mapSectionToMealType(section?: string): 'breakfast' | 'lunch' | 'dinner' {
  if (!section) return 'dinner';
  const lower = section.toLowerCase();
  if (lower.includes('breakfast') || lower.includes('morning')) return 'breakfast';
  if (lower.includes('lunch') || lower.includes('noon')) return 'lunch';
  return 'dinner';
}
