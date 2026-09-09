import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { refreshEntities, resetHaEntityStore, subscribeEntities } from './ha-entity-store';
import { getAllEntityStates, getEntityState } from './ha-rest';

vi.mock('./ha-rest', () => ({
  getEntityState: vi.fn(),
  getAllEntityStates: vi.fn(),
}));

const mockGetEntityState = vi.mocked(getEntityState);
const mockGetAllEntityStates = vi.mocked(getAllEntityStates);

function entityState(entityId: string, state = 'on') {
  return { entity_id: entityId, state, attributes: {} };
}

/** Lets queued fetch promises settle without advancing the poll interval. */
function flush() {
  return vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetEntityState.mockReset();
  mockGetAllEntityStates.mockReset();
  mockGetEntityState.mockImplementation(async (entityId: string) => entityState(entityId));
  mockGetAllEntityStates.mockResolvedValue([]);
  resetHaEntityStore();
});

afterEach(() => {
  resetHaEntityStore();
  vi.useRealTimers();
});

describe('ha-entity-store — one poller for every card', () => {
  it('fetches an entity once per tick no matter how many cards subscribe', async () => {
    subscribeEntities(['light.kitchen'], vi.fn());
    subscribeEntities(['light.kitchen'], vi.fn());
    subscribeEntities(['light.kitchen'], vi.fn());
    await flush();
    mockGetEntityState.mockClear();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(mockGetEntityState).toHaveBeenCalledTimes(1);
  });

  it('notifies every subscriber with the entities it asked for', async () => {
    const kitchen = vi.fn();
    const hallway = vi.fn();
    subscribeEntities(['light.kitchen'], kitchen);
    subscribeEntities(['light.hallway'], hallway);

    await flush();

    expect(kitchen).toHaveBeenLastCalledWith({ 'light.kitchen': entityState('light.kitchen') });
    expect(hallway).toHaveBeenLastCalledWith({ 'light.hallway': entityState('light.hallway') });
  });

  it('stops polling once the last subscriber unsubscribes', async () => {
    const unsubscribeA = subscribeEntities(['light.kitchen'], vi.fn());
    const unsubscribeB = subscribeEntities(['light.hallway'], vi.fn());
    await flush();

    unsubscribeA();
    mockGetEntityState.mockClear();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mockGetEntityState).toHaveBeenCalled();

    unsubscribeB();
    mockGetEntityState.mockClear();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mockGetEntityState).not.toHaveBeenCalled();
  });

  it('switches to a single bulk request once many entities are subscribed', async () => {
    const entityIds = Array.from({ length: 9 }, (_, i) => `light.lamp_${i}`);
    mockGetAllEntityStates.mockResolvedValue(entityIds.map((id) => entityState(id)));
    subscribeEntities(entityIds, vi.fn());
    await flush();
    mockGetAllEntityStates.mockClear();
    mockGetEntityState.mockClear();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(mockGetAllEntityStates).toHaveBeenCalledTimes(1);
    expect(mockGetEntityState).not.toHaveBeenCalled();
  });

  it('refreshes on demand so a card can update right after a service call', async () => {
    const listener = vi.fn();
    subscribeEntities(['light.kitchen'], listener);
    await flush();
    mockGetEntityState.mockResolvedValue(entityState('light.kitchen', 'off'));

    await refreshEntities(['light.kitchen']);

    expect(listener).toHaveBeenLastCalledWith({ 'light.kitchen': entityState('light.kitchen', 'off') });
  });

  it('keeps the last known state when a fetch fails', async () => {
    const listener = vi.fn();
    subscribeEntities(['light.kitchen'], listener);
    await flush();
    mockGetEntityState.mockResolvedValue(null);

    await refreshEntities(['light.kitchen']);

    expect(listener).toHaveBeenLastCalledWith({ 'light.kitchen': entityState('light.kitchen') });
  });
});
