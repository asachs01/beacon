import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { media, resetMedia, addPhotos } from '../test/fake-media-source';
import { clearPhotoCaches } from '../api/photos';
import { clearLoadedPhotos } from '../utils/photo-loader';
import { ScreenSaver } from './ScreenSaver';
import { isDisplayAsleep } from '../utils/display-sleep';

vi.mock('../api/ha-rest', async () => (await import('../test/fake-media-source')).haRestMock);
vi.mock('../utils/ha-env', () => ({ isAddOn: () => true }));

const MIN = 60 * 1000;

let downloads: string[];

/** Let the clock run on, and pending browse/resolve/download promises finish. */
const wait = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 20; i++) await Promise.resolve();
});

beforeEach(() => {
  resetMedia();
  clearPhotoCaches();
  clearLoadedPhotos();
  addPhotos(10);
  downloads = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-26T08:00:00Z'));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    downloads.push(url);
    return new Promise(() => {}); // never finishes: only who asks matters here
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ScreenSaver photos', () => {
  it("doesn't look for photos when photos are off", async () => {
    render(<ScreenSaver enabled showPhotos={false} dimTimeoutMin={5} screenSaverTimeoutMin={10} />);
    await wait(15 * MIN);
    expect(media.browses).toEqual([]);
    expect(media.resolves).toEqual([]);
    expect(downloads).toEqual([]);
  });

  it("doesn't look for photos when the screensaver is off", async () => {
    render(<ScreenSaver enabled={false} showPhotos dimTimeoutMin={5} screenSaverTimeoutMin={10} />);
    await wait(15 * MIN);
    expect(media.browses).toEqual([]);
    expect(media.resolves).toEqual([]);
  });

  it('waits until the screen dims, then gets just the first photo ready', async () => {
    render(<ScreenSaver enabled showPhotos dimTimeoutMin={5} screenSaverTimeoutMin={10} />);
    await wait(4 * MIN);
    expect(media.browses).toEqual([]);

    await wait(1.5 * MIN); // dimmed
    expect(media.browses).toHaveLength(1);
    expect(media.resolves).toHaveLength(2); // this photo and the next
    expect(downloads).toHaveLength(1); // this photo, downloaded ahead

    await wait(5 * MIN); // screensaver showing
    expect(downloads).toHaveLength(1); // shown from the download above
    expect(document.querySelector('.screensaver-photo')).not.toBeNull();
  });
});

describe('ScreenSaver and background refreshes', () => {
  // Refreshes (music, lists, weather...) pause while the screensaver covers
  // the app, and not while the screen is only dimmed and still readable.
  it('reports the display asleep only while the screensaver shows', async () => {
    const { container, unmount } = render(<ScreenSaver enabled dimTimeoutMin={5} screenSaverTimeoutMin={10} />);
    await wait(6 * MIN); // dimmed
    expect(isDisplayAsleep()).toBe(false);

    await wait(5 * MIN); // screensaver showing
    expect(isDisplayAsleep()).toBe(true);

    act(() => (container.querySelector('.screensaver-overlay') as HTMLElement).click());
    expect(isDisplayAsleep()).toBe(false);

    await wait(11 * MIN);
    expect(isDisplayAsleep()).toBe(true);
    unmount();
    expect(isDisplayAsleep()).toBe(false);
  });
});

describe('ScreenSaver wake', () => {
  // Touching the dimmed screen woke it at touchstart, taking the overlay
  // away, and the browser then sent the tap's click to whatever was under
  // the finger: waking the display ticked a chore or switched a light.
  it("wakes on a tap without also pressing what's under it", async () => {
    const pressed = vi.fn();
    const { container, getByRole } = render(
      <>
        <button type="button" onClick={pressed}>Tick chore</button>
        <ScreenSaver enabled dimTimeoutMin={5} screenSaverTimeoutMin={10} />
      </>,
    );
    await wait(6 * MIN);
    expect(container.querySelector('.screensaver-dim')).not.toBeNull();

    act(() => { window.dispatchEvent(new Event('touchstart')); });
    expect(container.querySelector('.screensaver-dim')).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Tick chore' }));
    expect(pressed).not.toHaveBeenCalled();

    // The next tap is for the app.
    await wait(1000);
    fireEvent.click(getByRole('button', { name: 'Tick chore' }));
    expect(pressed).toHaveBeenCalledTimes(1);
  });
});
