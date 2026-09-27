import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../api/ha-rest', () => ({ hasToken: () => true }));
vi.mock('../api/ha-services', () => ({
  findWeatherEntity: async () => ({ entity_id: 'weather.home', state: 'sunny', attributes: {} }),
  getWeatherForecast: async () => [
    // Monday 28 September's forecast, at noon there, given in UTC
    { datetime: '2026-09-27T23:00:00+00:00', condition: 'rainy', temperature: 17, templow: 9 },
  ],
}));

import { useWeatherForecast } from './useWeatherForecast';

let timeZone: string | undefined;
beforeAll(() => {
  timeZone = process.env.TZ;
  process.env.TZ = 'Pacific/Auckland';
});
afterAll(() => {
  if (timeZone === undefined) delete process.env.TZ;
  else process.env.TZ = timeZone;
});

describe('useWeatherForecast', () => {
  // The date was read off the string, which in UTC was still the day
  // before: the Calendar showed Monday's weather on Sunday.
  it('puts each forecast on the day it falls on here', async () => {
    const { result } = renderHook(() => useWeatherForecast());
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toMatchObject({ date: '2026-09-28', condition: 'rainy', tempHigh: 17, tempLow: 9 });
  });
});
