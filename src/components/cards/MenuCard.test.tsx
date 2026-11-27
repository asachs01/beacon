import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DashboardCardContext } from '../../types/dashboard-cards';
import { MenuCard } from './MenuCard';

describe('MenuCard', () => {
  it('stays on screen and offers every meal when the day is empty', () => {
    render(
      <MenuCard
        config={{}}
        context={{
          todaysMenu: { date: '2026-11-20', meals: [] },
        } as DashboardCardContext}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.getByText('Breakfast')).toBeInTheDocument();
    expect(screen.getByText('Lunch')).toBeInTheDocument();
    expect(screen.getByText('Dinner')).toBeInTheDocument();
    expect(screen.getByText('Snack')).toBeInTheDocument();
    expect(screen.getAllByText('Add meal')).toHaveLength(4);
  });
});
