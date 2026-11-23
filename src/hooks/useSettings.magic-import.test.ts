import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from './useSettings';

describe('magic import setting', () => {
  afterEach(() => {
    delete window.__BEACON_CONFIG__;
    vi.restoreAllMocks();
  });

  it('keeps every stored setting and only adds magicImport when the key is new', async () => {
    localStorage.setItem('beacon-settings', JSON.stringify({
      familyName: 'Sachs',
      voiceButton: false,
      kioskMode: true,
      choresResetTime: '06:30',
    }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.settings.familyName).toBe('Sachs');
    expect(result.current.settings.voiceButton).toBe(false);
    expect(result.current.settings.kioskMode).toBe(true);
    expect(result.current.settings.choresResetTime).toBe('06:30');
    expect(result.current.settings.magicImport).toBe(false);
    expect(result.current.settings.magicImportUseHaAgent).toBe(true);
    expect(result.current.settings.magicImportAiTaskEntity).toBe('');

    const stored = JSON.parse(localStorage.getItem('beacon-settings') ?? '{}') as Record<string, unknown>;
    expect(stored.familyName).toBe('Sachs');
    expect(stored.voiceButton).toBe(false);
    expect(stored.kioskMode).toBe(true);
    expect(stored.choresResetTime).toBe('06:30');
    expect(stored.magicImport).toBe(false);
    expect(stored.magicImportUseHaAgent).toBe(true);
    expect(stored.magicImportAiTaskEntity).toBe('');
  });

  it('turns magic import on for an add-on that has never stored the key', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    window.__BEACON_CONFIG__ = {};
    localStorage.setItem('beacon-settings', JSON.stringify({
      familyName: 'Sachs',
      voiceButton: false,
    }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.settings.magicImport).toBe(true);
    expect(result.current.settings.voiceButton).toBe(false);
    expect(result.current.settings.familyName).toBe('Sachs');
    expect(result.current.settings.magicImportUseHaAgent).toBe(true);
  });

  it('keeps a saved choice to force the local parser', async () => {
    localStorage.setItem('beacon-settings', JSON.stringify({
      familyName: 'Sachs',
      voiceButton: false,
      magicImportUseHaAgent: false,
    }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.settings.magicImportUseHaAgent).toBe(false);
    expect(result.current.settings.familyName).toBe('Sachs');
    expect(result.current.settings.voiceButton).toBe(false);
  });

  it('keeps a saved AI Task entity and stays empty when the key was never stored', async () => {
    localStorage.setItem('beacon-settings', JSON.stringify({
      familyName: 'Sachs',
      magicImportAiTaskEntity: 'ai_task.ollama_ai_task',
    }));

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.settings.magicImportAiTaskEntity).toBe('ai_task.ollama_ai_task');
    expect(result.current.settings.familyName).toBe('Sachs');
    expect(result.current.settings.magicImportUseHaAgent).toBe(true);
  });
});
