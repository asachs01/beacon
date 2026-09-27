import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { BeaconSettings } from '../hooks/useSettings';
import type { FamilyMember } from '../types/family';

vi.mock('../hooks/useRoutines', () => ({
  useRoutines: () => ({ routines: [], addRoutine: vi.fn(), updateRoutine: vi.fn(), removeRoutine: vi.fn() }),
}));

import { SettingsView } from './SettingsView';

const kai: FamilyMember = {
  id: 'kai', name: 'Kai', avatar: '👦', color: '#3b82f6', role: 'child', pin: '1234',
  calendar_entity: 'calendar.kai', additional_calendar_entities: ['calendar.soccer'],
};

function renderSettings(props: Partial<Parameters<typeof SettingsView>[0]> = {}) {
  const on = {
    onUpdateSettings: vi.fn(),
    onResetSettings: vi.fn(),
    onUpdateMember: vi.fn(),
    onAddMember: vi.fn(),
    onRemoveMember: vi.fn(),
  };
  render(
    <SettingsView
      settings={{ permanentlyHiddenCalendars: [], calendarColors: {}, groceryListIds: [], choresSyncListByMember: {} } as unknown as BeaconSettings}
      onExportSettings={() => ''}
      onImportSettings={vi.fn()}
      onClearLocalStorage={vi.fn()}
      members={[kai]}
      connected={false}
      haUrl=""
      calendars={[{ id: 'calendar.kai', name: 'Kai' }, { id: 'calendar.soccer', name: 'Soccer' }]}
      onEnterFocusMode={vi.fn()}
      {...on}
      {...props}
    />,
  );
  return on;
}

describe('SettingsView family members', () => {
  // An edit is merged into the stored member by the add-on (collectionUpdate
  // in server.js), and fields left undefined don't survive JSON: a linked
  // calendar or a PIN could never be removed.
  it("removes a member's calendars and PIN when they're cleared", () => {
    const on = renderSettings();
    fireEvent.click(screen.getByText('Family Members'));
    fireEvent.click(screen.getByLabelText('Edit Kai'));

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '' } });
    fireEvent.click(screen.getByText('Remove'));
    fireEvent.change(screen.getByPlaceholderText('****'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Save Changes'));

    const [id, patch] = on.onUpdateMember.mock.calls[0];
    const stored = { ...kai, ...JSON.parse(JSON.stringify(patch)) };
    expect(id).toBe('kai');
    expect(stored.calendar_entity).toBeFalsy();
    expect(stored.additional_calendar_entities).toEqual([]);
    expect(stored.pin).toBeFalsy();
  });
});

describe('SettingsView reset', () => {
  // It reset every display's settings on one tap, with no undo.
  it('resets to the defaults only on a second tap', () => {
    const on = renderSettings();
    fireEvent.click(screen.getByText('About'));

    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    expect(on.onResetSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Tap again to reset' }));
    expect(on.onResetSettings).toHaveBeenCalledTimes(1);
  });
});
