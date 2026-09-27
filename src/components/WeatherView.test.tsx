import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WeatherView } from './WeatherView';
import { getWeatherForecast } from '../api/ha-services';

vi.mock('../api/ha-rest', () => ({ hasToken: () => true }));
vi.mock('../utils/display-sleep', () => ({ refreshWhileAwake: () => () => {} }));
vi.mock('../api/ha-services', () => ({
  findWeatherEntity: vi.fn(async () => ({
    entity_id: 'weather.home',
    state: 'rainy',
    attributes: {
      temperature: 18.4,
      temperature_unit: '°C',
      humidity: 81,
      wind_speed: 12,
      wind_speed_unit: 'km/h',
      wind_bearing: 225,
      apparent_temperature: 16,
    },
  })),
  getWeatherForecast: vi.fn(),
}));

const day = (iso: string, temperature: number, templow: number, condition = 'rainy') =>
  ({ datetime: iso, condition, temperature, templow, precipitation_probability: 60 });
const hour = (iso: string, temperature: number) => ({ datetime: iso, condition: 'rainy', temperature });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-27T10:20:00'));
  vi.mocked(getWeatherForecast).mockImplementation(async (_id: string, type: string) => (type === 'daily'
    ? [day('2026-09-27T00:00:00', 19, 11), day('2026-09-28T00:00:00', 23, 12, 'sunny')]
    : [
      hour('2026-09-27T08:00:00', 13),
      hour('2026-09-27T10:00:00', 15),
      hour('2026-09-27T11:00:00', 16),
      hour('2026-09-28T09:00:00', 17),
    ]) as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WeatherView', () => {
  it('shows the temperature, today’s high and low, and the details', async () => {
    render(<WeatherView />);

    expect(await screen.findByText('18°')).toBeInTheDocument();
    expect(screen.getByText('Rainy')).toBeInTheDocument();
    expect(screen.getByText(/H:19°\s+L:11°/)).toBeInTheDocument();
    expect(screen.getByText('81%')).toBeInTheDocument();
    // 225° is south-west
    expect(screen.getByText('SW', { exact: false })).toBeInTheDocument();
  });

  it('shows the coming hours until a day is picked, then that day’s', async () => {
    render(<WeatherView />);
    await screen.findByText('Hourly forecast');

    // From the hour under way, not ones already gone
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.queryByText('13°')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Monday/ }));
    expect(screen.getByText(/Hourly — Monday, Sep 28/)).toBeInTheDocument();
    expect(screen.getByText('9 AM')).toBeInTheDocument();
    expect(screen.queryByText('Now')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next 24 hours' }));
    expect(screen.getByText('Hourly forecast')).toBeInTheDocument();
  });

  it('calls the first day Today', async () => {
    render(<WeatherView />);
    expect(await screen.findByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
  });
});
