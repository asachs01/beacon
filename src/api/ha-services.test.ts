import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findWeatherEntity } from './ha-services';
import { haFetch } from './ha-rest';

vi.mock('./ha-rest', () => ({
  haFetch: vi.fn(async (path: string) => ({ entity_id: path.split('/').pop(), state: 'sunny', attributes: {} })),
  fetchAllStates: vi.fn(async () => []),
  callHaService: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(haFetch).mockClear();
});

describe('findWeatherEntity', () => {
  // Settings' Weather Entity used to be ignored for the add-on option.
  it('uses the weather entity chosen in Settings', async () => {
    localStorage.setItem('beacon-settings', JSON.stringify({ weatherEntity: 'weather.garden' }));

    expect((await findWeatherEntity())?.entity_id).toBe('weather.garden');
    expect(haFetch).toHaveBeenCalledWith('/api/states/weather.garden');
  });

  it('uses the add-on option when Settings has none', async () => {
    expect((await findWeatherEntity())?.entity_id).toBe('weather.home');
  });
});
