import { describe, it, expect } from 'vitest';
import { isSupportedImageFile, resolveMemberPhoto } from './member-photo';

/**
 * Uploads are decoded through <canvas>, which jsdom does not implement, so the
 * data-URL pipeline itself is exercised in the browser. What is worth locking
 * down here is the reference resolution (uploads vs. HA paths vs. URLs) and the
 * upload guard that keeps oversized / non-image files out of localStorage.
 */
describe('resolveMemberPhoto', () => {
  it('passes uploaded data URLs through unchanged', () => {
    const dataUrl = 'data:image/jpeg;base64,AAAA';
    expect(resolveMemberPhoto(dataUrl)).toBe(dataUrl);
  });

  it('passes object URLs through unchanged', () => {
    const blobUrl = 'blob:http://localhost/abc-123';
    expect(resolveMemberPhoto(blobUrl)).toBe(blobUrl);
  });

  it('leaves absolute URLs alone', () => {
    expect(resolveMemberPhoto('https://example.test/photo.png')).toBe(
      'https://example.test/photo.png',
    );
  });
});

describe('isSupportedImageFile', () => {
  it('rejects files that are not images', () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    expect(isSupportedImageFile(file)).toBe(false);
  });

  it('accepts a small image', () => {
    const file = new File([new Uint8Array(16)], 'photo.png', { type: 'image/png' });
    expect(isSupportedImageFile(file)).toBe(true);
  });

  it('rejects images above the upload ceiling', () => {
    const huge = new File([new Uint8Array(13 * 1024 * 1024)], 'huge.png', {
      type: 'image/png',
    });
    expect(isSupportedImageFile(huge)).toBe(false);
  });
});
