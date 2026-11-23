import { describe, expect, it } from 'vitest';
import { en } from '../i18n/translations/en';
import { HEIC_UNREADABLE, heicToJpeg } from './heic';

describe('HEIC conversion', () => {
  it('uses the plain device error when the browser cannot decode the photo', async () => {
    const file = new Blob(['not a photo'], { type: 'image/heic' });
    await expect(heicToJpeg(file, async () => {
      throw new Error('The source image cannot be decoded.');
    })).rejects.toThrow(HEIC_UNREADABLE);
    expect(HEIC_UNREADABLE).toBe(en['import.heicError']);
    expect(HEIC_UNREADABLE).not.toMatch(/never leaves your device/i);
  });

  it('uses the same error when decoding returns an empty image', async () => {
    const empty = { width: 0, height: 0, close() {} } as ImageBitmap;
    await expect(heicToJpeg(new Blob(['x']), async () => empty)).rejects.toThrow(HEIC_UNREADABLE);
  });
});
