/**
 * One file per import, 10 MB, JPEG / PNG / HEIC / PDF.
 * The bytes stay in memory. Nothing here writes /data or localStorage.
 */
import type { TranslationKey } from '../i18n';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export type ImportFileKind = 'jpeg' | 'png' | 'heic' | 'pdf';

export function importFileKind(file: { name: string; type: string }): ImportFileKind | null {
  const type = file.type.toLowerCase().split(';')[0].trim();
  const name = file.name.toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return 'heic';
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpeg';
  if (type === 'image/png') return 'png';
  if (type === 'application/pdf') return 'pdf';
  if (name.endsWith('.heic') || name.endsWith('.heif')) return 'heic';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpeg';
  if (name.endsWith('.png')) return 'png';
  if (name.endsWith('.pdf')) return 'pdf';
  return null;
}

export function fileProblem(
  files: ArrayLike<{ name: string; type: string; size: number }>,
  maxBytes = MAX_IMPORT_BYTES,
): TranslationKey | null {
  if (files.length === 0) return null;
  if (files.length !== 1) return 'import.oneFile';
  const file = files[0];
  if (file.size > maxBytes) return 'import.tooLarge';
  if (!importFileKind(file)) return 'import.badType';
  return null;
}

export function beaconMediaFilename(ext: 'jpg' | 'png'): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `beacon-import-${hex}.${ext}`;
}
