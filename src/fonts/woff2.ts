import { MAX_WOFF2_BYTES } from './selection';

export type Woff2ReadResult =
  | { ok: true; data: ArrayBuffer }
  | { ok: false; error: 'type' | 'size' | 'invalid' };

const WOFF2_MAGIC = [0x77, 0x4f, 0x46, 0x32]; // "wOF2"

function isWoff2Mime(type: string): boolean {
  return type === 'font/woff2' || type === 'application/font-woff2';
}

/**
 * Accept a `.woff2` (or the matching MIME type) up to {@link MAX_WOFF2_BYTES}.
 * The header must be the wOFF2 signature so a renamed text file is rejected.
 */
export async function readValidWoff2(file: File): Promise<Woff2ReadResult> {
  const name = file.name.trim().toLowerCase();
  const mime = file.type.trim().toLowerCase();
  const extensionOk = name.endsWith('.woff2');
  if (!extensionOk && !isWoff2Mime(mime)) {
    return { ok: false, error: 'type' };
  }
  if (file.size <= 0 || file.size > MAX_WOFF2_BYTES) {
    return { ok: false, error: 'size' };
  }
  const data = await file.arrayBuffer();
  const bytes = new Uint8Array(data);
  const magicOk = WOFF2_MAGIC.every((byte, index) => bytes[index] === byte);
  if (!magicOk) return { ok: false, error: 'invalid' };
  return { ok: true, data };
}

export function displayFileName(name: string): string {
  const base = name.split(/[/\\]/).pop()?.trim() || 'font.woff2';
  return base.slice(0, 120);
}
