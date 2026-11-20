import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_FONT, DEFAULT_HEADING_FONT } from '../fonts/selection';
import { useSettings } from './useSettings';

describe('font settings persistence', () => {
  it('saves heading and body choices with the other settings and restores them', async () => {
    const first = renderHook(() => useSettings());
    await waitFor(() => {
      expect(localStorage.getItem('beacon-settings')).toBeTruthy();
    });

    act(() => {
      first.result.current.updateSettings({
        headingFont: { kind: 'builtin', id: 'nunito' },
        bodyFont: { kind: 'google', family: 'Roboto' },
      });
    });

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('beacon-settings') ?? '{}') as {
        headingFont?: unknown;
        bodyFont?: unknown;
      };
      expect(stored.headingFont).toEqual({ kind: 'builtin', id: 'nunito' });
      expect(stored.bodyFont).toEqual({ kind: 'google', family: 'Roboto' });
    });

    first.unmount();

    const second = renderHook(() => useSettings());
    await waitFor(() => {
      expect(second.result.current.settings.headingFont).toEqual({ kind: 'builtin', id: 'nunito' });
      expect(second.result.current.settings.bodyFont).toEqual({ kind: 'google', family: 'Roboto' });
    });
    second.unmount();
  });

  it('normalizes invalid stored choices back to the current app fonts', async () => {
    localStorage.setItem('beacon-settings', JSON.stringify({
      headingFont: { kind: 'upload', id: 'not valid' },
      bodyFont: { kind: 'builtin', id: 'comic-sans' },
    }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('beacon-settings') ?? '{}') as {
        headingFont?: unknown;
        bodyFont?: unknown;
      };
      expect(stored.headingFont).toEqual(DEFAULT_HEADING_FONT);
      expect(stored.bodyFont).toEqual(DEFAULT_BODY_FONT);
    });
    expect(result.current.settings.headingFont).toEqual(DEFAULT_HEADING_FONT);
    expect(result.current.settings.bodyFont).toEqual(DEFAULT_BODY_FONT);
  });

  it('keeps a valid imported choice and replaces an invalid one', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      expect(localStorage.getItem('beacon-settings')).toBeTruthy();
    });

    act(() => {
      result.current.importSettings(JSON.stringify({
        headingFont: { kind: 'builtin', id: 'lexend' },
        bodyFont: { kind: 'nope' },
      }));
    });

    expect(result.current.settings.headingFont).toEqual({ kind: 'builtin', id: 'lexend' });
    expect(result.current.settings.bodyFont).toEqual(DEFAULT_BODY_FONT);
  });
});
