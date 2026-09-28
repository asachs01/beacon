import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { media, resetMedia, addPhotos, PHOTO_FOLDER } from '../test/fake-media-source';
import { clearPhotoCaches } from '../api/photos';
import { usePhotos } from './usePhotos';

vi.mock('../api/ha-rest', async () => (await import('../test/fake-media-source')).haRestMock);
vi.mock('../utils/ha-env', () => ({ isAddOn: () => true }));

const HOUR = 60 * 60 * 1000;

/** Let pending browse/resolve promises finish. */
const settle = () => act(async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
});

beforeEach(() => {
  resetMedia();
  clearPhotoCaches();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePhotos', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-26T08:00:00Z'));
  });

  it('resolves only the photo on screen and the next one', async () => {
    addPhotos(10);
    const { result } = renderHook(() => usePhotos());
    await waitFor(() => expect(result.current.upcomingPhoto).not.toBeNull());

    expect(result.current.photoCount).toBe(10);
    expect(result.current.currentPhoto).not.toBeNull();
    expect(new Set(media.resolves).size).toBe(2);
    expect(media.resolves).toHaveLength(2);

    // Moving on shows the already-resolved next photo straight away and
    // resolves just the one after it.
    const upcomingUrl = result.current.upcomingPhoto!.url;
    act(() => result.current.nextPhoto());
    expect(result.current.currentPhoto?.url).toBe(upcomingUrl);
    await waitFor(() => expect(result.current.upcomingPhoto).not.toBeNull());
    expect(media.resolves).toHaveLength(3);
  });

  it('shares one folder browse between the Photos screen and the screensaver', async () => {
    addPhotos(10);
    const frame = renderHook(() => usePhotos());
    const saver = renderHook(() => usePhotos());
    await waitFor(() => expect(frame.result.current.currentPhoto).not.toBeNull());
    await waitFor(() => expect(saver.result.current.currentPhoto).not.toBeNull());
    expect(media.browses).toEqual([PHOTO_FOLDER]);
  });

  it("asks HA for nothing while it isn't enabled", async () => {
    addPhotos(10);
    const { result, rerender } = renderHook(({ enabled }) => usePhotos(undefined, 30, { enabled }), {
      initialProps: { enabled: false },
    });
    await settle();
    expect(media.browses).toEqual([]);
    expect(media.resolves).toEqual([]);
    expect(result.current.currentPhoto).toBeNull();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.currentPhoto).not.toBeNull());
  });

  it('resolves a URL again once it is 12 hours old, before showing it', async () => {
    addPhotos(3);
    const { result } = renderHook(() => usePhotos());
    await waitFor(() => expect(result.current.upcomingPhoto).not.toBeNull());
    const staleUrl = result.current.upcomingPhoto!.url;

    vi.setSystemTime(Date.now() + 13 * HOUR);
    act(() => result.current.nextPhoto());
    await waitFor(() => expect(result.current.currentPhoto?.url).not.toBe(staleUrl));
    expect(result.current.currentPhoto?.url).toMatch(/authSig=/);
    await waitFor(() => expect(media.resolves).toHaveLength(4)); // 2 at start, then this one again + the next
  });

  it('resolves a photo again when it fails to load, but only once', async () => {
    addPhotos(3);
    const { result } = renderHook(() => usePhotos());
    await waitFor(() => expect(result.current.upcomingPhoto).not.toBeNull());
    const failed = result.current.currentPhoto!.url;

    act(() => result.current.reportLoadError(failed));
    await waitFor(() => expect(result.current.currentPhoto?.url).toBeDefined());
    const retried = result.current.currentPhoto!.url;
    expect(retried).not.toBe(failed);
    expect(media.resolves).toHaveLength(3);

    // Broken rather than expired: leave it, don't keep asking HA.
    act(() => result.current.reportLoadError(retried));
    await settle();
    expect(media.resolves).toHaveLength(3);
    expect(result.current.currentPhoto?.url).toBe(retried);
  });

  it('ignores load errors for URLs no longer showing', async () => {
    addPhotos(3);
    const { result } = renderHook(() => usePhotos());
    await waitFor(() => expect(result.current.upcomingPhoto).not.toBeNull());
    act(() => result.current.reportLoadError('https://ha.local/media/local/old.jpg?authSig=x'));
    await settle();
    expect(media.resolves).toHaveLength(2);
  });
});

describe('usePhotos timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T08:00:00Z'));
  });

  it('moves to the next photo every interval, only while active', async () => {
    addPhotos(5);
    const { result } = renderHook(() => usePhotos(undefined, 30));
    await settle();
    expect(result.current.currentIndex).toBe(0);

    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(result.current.currentIndex).toBe(1);

    act(() => result.current.setActive(false));
    await act(() => vi.advanceTimersByTimeAsync(90_000));
    expect(result.current.currentIndex).toBe(1);
  });

  it.each([0, -5])('waits the default 30 seconds when the interval is %i', async (seconds) => {
    addPhotos(5);
    const { result } = renderHook(() => usePhotos(undefined, seconds));
    await settle();

    await act(() => vi.advanceTimersByTimeAsync(29_000));
    expect(result.current.currentIndex).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(result.current.currentIndex).toBe(1);
  });

  it('tries again a minute later when no photos came back', async () => {
    const { result } = renderHook(() => usePhotos());
    await settle();
    expect(result.current.photoCount).toBe(0);

    addPhotos(4);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    await settle();
    expect(result.current.photoCount).toBe(4);
  });

  it('picks up new photos when the list is refreshed, keeping the one on screen', async () => {
    addPhotos(4);
    const { result } = renderHook(() => usePhotos());
    await settle();
    act(() => result.current.setActive(false));
    act(() => result.current.nextPhoto());
    await settle();
    const onScreen = result.current.currentPhoto!.url;

    media.folders.get(PHOTO_FOLDER)!.push(`${PHOTO_FOLDER}/new-1.jpg`, `${PHOTO_FOLDER}/new-2.jpg`);
    await act(() => vi.advanceTimersByTimeAsync(HOUR));
    await settle();
    expect(result.current.photoCount).toBe(6);
    expect(result.current.currentPhoto?.url).toBe(onScreen);
  });
});
