import { describe, expect, it } from 'vitest';
import { buildSettingsReference } from '../../scripts/settings-reference.mjs';

describe('settings reference', () => {
  const page = buildSettingsReference();

  it('reads the notification lead time from useSettings (10 minutes)', () => {
    const row = page.split('\n').find((line) => line.includes('`notificationMinutes`'));
    expect(row).toBeTruthy();
    expect(row).toContain('Notification Timing');
    expect(row).toMatch(/\| 10 minutes \|/);
    expect(row).not.toMatch(/\| 5 minutes \|/);
  });

  it('includes add-on defaults from beacon/config.yaml', () => {
    const family = page.split('\n').find((line) => line.includes('`family_name`'));
    const token = page.split('\n').find((line) => line.includes('`ha_token`'));
    expect(family).toContain('My Family');
    expect(family).toContain('Family Name');
    expect(token).toContain('password');
    expect(token).toContain('(empty)');
  });

  it('includes the default calendar view from useSettings', () => {
    const row = page.split('\n').find((line) => line.includes('`defaultCalendarView`'));
    expect(row).toBeTruthy();
    expect(row).toContain('Default Calendar View');
    expect(row).toContain("'week' / 'month'");
    expect(row).toMatch(/\| week \|/);
  });

  it('uses the shipped heading font default', () => {
    const row = page.split('\n').find((line) => line.includes('`headingFont`'));
    expect(row).toContain('builtin: fraunces');
    expect(row).toContain('Heading font');
  });
});
