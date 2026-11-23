/**
 * HEIC/HEIF photos become JPEG only when this browser can decode them.
 * A failed decode is always a visible error. Beacon does not guess.
 */
export const HEIC_UNREADABLE =
  "This photo format (HEIC) can't be read on this device. Try a JPEG or PNG, or change your camera to Most Compatible.";

async function decodeWithBrowser(file: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error(HEIC_UNREADABLE);
  }
  return createImageBitmap(file);
}

export async function heicToJpeg(
  file: Blob,
  decode: (file: Blob) => Promise<ImageBitmap> = decodeWithBrowser,
): Promise<Blob> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await decode(file);
  } catch (err) {
    if (err instanceof Error && err.message === HEIC_UNREADABLE) throw err;
    throw new Error(HEIC_UNREADABLE);
  }
  if (!bitmap || bitmap.width < 1 || bitmap.height < 1) {
    bitmap?.close?.();
    throw new Error(HEIC_UNREADABLE);
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(HEIC_UNREADABLE);
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.92);
    });
    if (!blob || blob.size < 1) throw new Error(HEIC_UNREADABLE);
    return blob;
  } catch (err) {
    if (err instanceof Error && err.message === HEIC_UNREADABLE) throw err;
    throw new Error(HEIC_UNREADABLE);
  } finally {
    bitmap.close();
  }
}
