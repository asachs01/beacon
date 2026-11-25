import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BODY_FONT, DEFAULT_HEADING_FONT } from '../fonts/selection';
import type { BeaconSettings } from '../hooks/useSettings';
import { DailyResetTimeField } from './DailyResetTimeField';
import { SettingsView } from './SettingsView';

function Harness({ initial = '00:00' }: { initial?: string }) {
  const [saved, setSaved] = useState(initial);
  return (
    <>
      <label htmlFor="chores-reset-time">Daily Reset Time</label>
      <DailyResetTimeField id="chores-reset-time" value={saved} onChange={setSaved} />
      <output data-testid="saved">{saved}</output>
    </>
  );
}

describe('Daily Reset Time field', () => {
  it('saves a valid HH:mm value', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Daily Reset Time'), { target: { value: '03:00' } });
    expect(screen.getByTestId('saved')).toHaveTextContent('03:00');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an inline error and does not save an invalid value', () => {
    const onChange = vi.fn();
    render(<DailyResetTimeField id="chores-reset-time" value="04:00" onChange={onChange} />);
    const input = screen.getByLabelText('Daily Reset Time');

    for (const value of ['', '24:00', 'morning', '3:00']) {
      fireEvent.change(input, { target: { value } });
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a time as HH:mm, from 00:00 to 23:59.');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    }

    expect(input).toHaveValue('3:00');
  });

  it('shows the error for an already stored invalid value without rewriting it', () => {
    const onChange = vi.fn();
    render(<DailyResetTimeField id="chores-reset-time" value="morning" onChange={onChange} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

const settings = {
  familyName: 'Rivera',
  saveConfigInBrowser: true,
  defaultView: 'dashboard',
  timeFormat: '12h',
  weekStartsOn: 0,
  locale: 'en-US',
  themeId: 'skylight',
  autoDarkMode: false,
  darkModeStart: '19:00',
  darkModeEnd: '06:00',
  fontScale: 'normal',
  headingFont: DEFAULT_HEADING_FONT,
  bodyFont: DEFAULT_BODY_FONT,
  sidebarPosition: 'left',
  defaultCalendarView: 'week',
  defaultCalendar: '',
  permanentlyHiddenCalendars: [],
  calendarColors: {},
  defaultEventDuration: 60,
  notificationMinutes: 10,
  weatherEntity: 'weather.home',
  grocyEnabled: false,
  anylistEnabled: false,
  defaultGroceryList: '',
  groceryListIds: [],
  shoppingEntity: '',
  musicDefaultPlayer: '',
  photoDirectory: '/media/beacon/photos',
  photoInterval: 30,
  photoTransition: 'fade',
  dashboardLayout: 'default',
  advancedDashboard: false,
  screenSaverEnabled: true,
  dimTimeout: 5,
  screenSaverTimeout: 5,
  alwaysOnDisplay: false,
  showSeconds: false,
  kioskMode: false,
  kioskRevealGesture: true,
  voiceButton: true,
  choresEnabled: true,
  choresResetTime: '00:00',
  streakDays: 7,
  currencySymbol: '$',
  payoutSchedule: 'weekly',
  nightModeEnabled: false,
  nightModeStart: '21:00',
  nightModeEnd: '06:30',
  nightModeOverride: 'schedule',
  nightModeBrightness: 30,
  nightModeClockOnly: false,
} satisfies BeaconSettings;

describe('Settings → Chores → Daily Reset Time', () => {
  it('blocks an invalid time from the chores settings screen and saves a valid one', () => {
    const onUpdateSettings = vi.fn();
    render(
      <SettingsView
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        onResetSettings={() => {}}
        onExportSettings={() => ''}
        onImportSettings={() => {}}
        onClearLocalStorage={() => {}}
        fontStatus={{ headingFellBack: false, bodyFellBack: false }}
        members={[]}
        onAddMember={() => {}}
        onUpdateMember={() => {}}
        onRemoveMember={() => {}}
        connected={false}
        haUrl=""
        calendars={[]}
        onEnterFocusMode={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Chores' }));
    const input = screen.getByLabelText('Daily Reset Time');

    fireEvent.change(input, { target: { value: '24:00' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a time as HH:mm, from 00:00 to 23:59.');
    expect(onUpdateSettings).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '03:00' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onUpdateSettings).toHaveBeenCalledWith({ choresResetTime: '03:00' });
  });
});
