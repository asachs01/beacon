/**
 * Font choices saved with the rest of Beacon's settings.
 *
 * Built-in faces are bundled (latin woff2 only) and loaded on demand.
 * "Fraunces" and "Inter" are the faces the app shipped with — headings and
 * body, respectively — so the defaults keep today's look.
 */

export const BUILTIN_FONT_IDS = [
  'system',
  'fraunces',
  'inter',
  'atkinson-hyperlegible',
  'lexend',
  'nunito',
  'source-sans-3',
  'literata',
] as const;

export type BuiltinFontId = (typeof BUILTIN_FONT_IDS)[number];
export type LoadableBuiltinId = Exclude<BuiltinFontId, 'system'>;

export type FontSelection =
  | { kind: 'builtin'; id: BuiltinFontId }
  | { kind: 'google'; family: string }
  | { kind: 'upload'; id: string };

export interface BuiltinFace {
  id: LoadableBuiltinId;
  /** CSS font-family name registered for this face. */
  family: string;
  generic: 'serif' | 'sans-serif';
}

export const BUILTIN_FACES: Record<LoadableBuiltinId, BuiltinFace> = {
  fraunces: { id: 'fraunces', family: 'Fraunces', generic: 'serif' },
  inter: { id: 'inter', family: 'Inter', generic: 'sans-serif' },
  'atkinson-hyperlegible': {
    id: 'atkinson-hyperlegible',
    family: 'Atkinson Hyperlegible',
    generic: 'sans-serif',
  },
  lexend: { id: 'lexend', family: 'Lexend', generic: 'sans-serif' },
  nunito: { id: 'nunito', family: 'Nunito', generic: 'sans-serif' },
  'source-sans-3': { id: 'source-sans-3', family: 'Source Sans 3', generic: 'sans-serif' },
  literata: { id: 'literata', family: 'Literata', generic: 'serif' },
};

/** Every custom stack ends with this so a missing face still renders. */
export const SYSTEM_FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const SERIF_FALLBACKS = 'ui-serif, Georgia, "Times New Roman", serif';

export const DEFAULT_HEADING_FONT: FontSelection = { kind: 'builtin', id: 'fraunces' };
export const DEFAULT_BODY_FONT: FontSelection = { kind: 'builtin', id: 'inter' };

/** About 2 MB — large enough for a latin variable face, small enough for IndexedDB. */
export const MAX_WOFF2_BYTES = 2 * 1024 * 1024;

/** Give up on a face that never settles (blocked CDN, hung decode). */
export const FONT_LOAD_TIMEOUT_MS = 8_000;

export function isBuiltinFontId(value: string): value is BuiltinFontId {
  return (BUILTIN_FONT_IDS as readonly string[]).includes(value);
}

export function isLoadableBuiltinId(value: string): value is LoadableBuiltinId {
  return value !== 'system' && isBuiltinFontId(value);
}

/** Google Fonts family names we are willing to put into a stylesheet URL. */
export function sanitizeGoogleFamily(input: string): string | null {
  const family = input.trim().replace(/\s+/g, ' ');
  if (family.length < 3 || family.length > 60) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9 ]*$/.test(family)) return null;
  return family;
}

export function uploadFamilyName(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9]/g, '');
  return `Beacon Custom ${safe || 'Font'}`;
}

export function fontStack(family: string | null, generic: 'serif' | 'sans-serif' = 'sans-serif'): string {
  const cleaned = family?.replace(/["\\]/g, '').trim() ?? '';
  if (!cleaned) return SYSTEM_FONT_STACK;
  const quoted = `"${cleaned}"`;
  if (generic === 'serif') return `${quoted}, ${SERIF_FALLBACKS}, ${SYSTEM_FONT_STACK}`;
  return `${quoted}, ${SYSTEM_FONT_STACK}`;
}

/** Stack to apply for a choice. Uploads and Google families still end in the system stack. */
export function intendedStack(selection: FontSelection): string {
  if (selection.kind === 'builtin') {
    if (selection.id === 'system') return SYSTEM_FONT_STACK;
    const face = BUILTIN_FACES[selection.id];
    return fontStack(face.family, face.generic);
  }
  if (selection.kind === 'google') {
    return fontStack(sanitizeGoogleFamily(selection.family), 'sans-serif');
  }
  return fontStack(uploadFamilyName(selection.id), 'sans-serif');
}

/** True when a network or decode step has to succeed before the choice is real. */
export function selectionNeedsLoad(selection: FontSelection): boolean {
  if (selection.kind === 'builtin') return selection.id !== 'system';
  if (selection.kind === 'google') return sanitizeGoogleFamily(selection.family) !== null;
  return true;
}

export function normalizeFontSelection(value: unknown, fallback: FontSelection): FontSelection {
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Record<string, unknown>;
  if (record.kind === 'builtin' && typeof record.id === 'string' && isBuiltinFontId(record.id)) {
    return { kind: 'builtin', id: record.id };
  }
  if (record.kind === 'google' && typeof record.family === 'string') {
    return { kind: 'google', family: record.family.trim().slice(0, 80) };
  }
  if (
    record.kind === 'upload'
    && typeof record.id === 'string'
    && /^[0-9a-f-]{8,64}$/i.test(record.id)
  ) {
    return { kind: 'upload', id: record.id };
  }
  return fallback;
}
