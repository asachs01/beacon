/**
 * Load a chosen face.
 *
 * Built-ins are latin-subset woff2 files from @fontsource, imported only when
 * that face is selected so the initial bundle stays small. Nothing in this
 * module requests a CDN for those faces. Google Fonts is opt-in.
 */

import {
  BUILTIN_FACES,
  sanitizeGoogleFamily,
  uploadFamilyName,
  type FontSelection,
  type LoadableBuiltinId,
} from './selection';
import { idbFontStore, type FontFileStore } from './store';

interface FaceJob {
  key: string;
  family: string;
  source: string | BufferSource;
  weight: string;
}

const inflight = new Map<string, Promise<void>>();

function share(key: string, run: () => Promise<void>): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const pending = run().catch((error: unknown) => {
    inflight.delete(key);
    throw error;
  });
  inflight.set(key, pending);
  return pending;
}

/** Register one face. A FontFace decode error rejects so the caller can fall back. */
export function registerFontFace(job: FaceJob): Promise<void> {
  return share(job.key, async () => {
    if (typeof FontFace === 'undefined' || !document.fonts) {
      throw new Error('FontFace API unavailable');
    }
    const face = new FontFace(job.family, job.source, {
      weight: job.weight,
      style: 'normal',
      display: 'swap',
    });
    const loaded = await face.load();
    document.fonts.add(loaded);
  });
}

async function sourceUrl(loader: () => Promise<{ default: string }>): Promise<string> {
  const mod = await loader();
  return mod.default;
}

/**
 * Dynamic import keeps each woff2 out of the initial graph. Paths are static
 * so Vite can still emit them as separate assets.
 */
async function builtinJobs(id: LoadableBuiltinId): Promise<FaceJob[]> {
  const family = BUILTIN_FACES[id].family;
  switch (id) {
    case 'fraunces':
      return [{
        key: 'builtin:fraunces',
        family,
        weight: '100 900',
        source: `url(${JSON.stringify(await sourceUrl(() => import('@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2?url')))})`,
      }];
    case 'inter':
      return [{
        key: 'builtin:inter',
        family,
        weight: '100 900',
        source: `url(${JSON.stringify(await sourceUrl(() => import('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url')))})`,
      }];
    case 'lexend':
      return [{
        key: 'builtin:lexend',
        family,
        weight: '100 900',
        source: `url(${JSON.stringify(await sourceUrl(() => import('@fontsource-variable/lexend/files/lexend-latin-wght-normal.woff2?url')))})`,
      }];
    case 'nunito':
      return [{
        key: 'builtin:nunito',
        family,
        weight: '200 1000',
        source: `url(${JSON.stringify(await sourceUrl(() => import('@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url')))})`,
      }];
    case 'source-sans-3':
      return [{
        key: 'builtin:source-sans-3',
        family,
        weight: '200 900',
        source: `url(${JSON.stringify(await sourceUrl(() => import('@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2?url')))})`,
      }];
    case 'literata':
      return [{
        key: 'builtin:literata',
        family,
        weight: '200 900',
        source: `url(${JSON.stringify(await sourceUrl(() => import('@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url')))})`,
      }];
    case 'atkinson-hyperlegible': {
      const regular = await sourceUrl(
        () => import('@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2?url'),
      );
      const bold = await sourceUrl(
        () => import('@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2?url'),
      );
      return [
        { key: 'builtin:atkinson:400', family, weight: '400', source: `url(${JSON.stringify(regular)})` },
        { key: 'builtin:atkinson:600', family, weight: '600', source: `url(${JSON.stringify(bold)})` },
        { key: 'builtin:atkinson:700', family, weight: '700', source: `url(${JSON.stringify(bold)})` },
      ];
    }
    default: {
      const never: never = id;
      throw new Error(`Unknown built-in font ${never}`);
    }
  }
}

export async function loadBuiltinFont(id: LoadableBuiltinId): Promise<void> {
  const jobs = await builtinJobs(id);
  for (const job of jobs) {
    await registerFontFace(job);
  }
}

function ensurePreconnect(href: string, crossOrigin: boolean): void {
  if (document.querySelector(`link[data-beacon-preconnect="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = href;
  if (crossOrigin) link.crossOrigin = 'anonymous';
  link.dataset.beaconPreconnect = href;
  document.head.appendChild(link);
}

async function injectGoogleStylesheet(family: string): Promise<void> {
  const query = family.replace(/\s+/g, '+');
  const id = `beacon-google-font-${query}`;
  const existing = document.getElementById(id);
  if (existing) return;
  ensurePreconnect('https://fonts.googleapis.com', false);
  ensurePreconnect('https://fonts.gstatic.com', true);
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${query}:wght@400;600;700&display=swap`;
  const loaded = new Promise<void>((resolve, reject) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => reject(new Error('Google Fonts stylesheet failed')), { once: true });
  });
  document.head.appendChild(link);
  try {
    await loaded;
  } catch (error) {
    link.remove();
    throw error;
  }
}

async function assertDocumentFont(family: string): Promise<void> {
  const fonts = document.fonts;
  if (!fonts?.load) throw new Error('FontFace API unavailable');
  const query = `16px "${family.replace(/"/g, '')}"`;
  const loaded = await fonts.load(query);
  if (Array.isArray(loaded) && loaded.length === 0 && !fonts.check?.(query)) {
    throw new Error(`Font unavailable: ${family}`);
  }
}

/** Opt-in runtime fetch. Callers must already have sanitized `family`. */
export async function loadGoogleFont(family: string): Promise<void> {
  const safe = sanitizeGoogleFamily(family);
  if (!safe) throw new Error('Invalid Google Fonts family');
  await injectGoogleStylesheet(safe);
  await assertDocumentFont(safe);
}

export async function loadUploadedFont(id: string, store: FontFileStore = idbFontStore): Promise<void> {
  const record = await store.get(id);
  if (!record?.data) throw new Error('Uploaded font is missing');
  const family = uploadFamilyName(id);
  const weights = ['400', '600', '700'];
  for (const weight of weights) {
    await registerFontFace({
      key: `upload:${id}:${weight}`,
      family,
      weight,
      source: record.data.slice(0),
    });
  }
}

export async function loadFontSelection(selection: FontSelection): Promise<void> {
  if (selection.kind === 'builtin') {
    if (selection.id === 'system') return;
    await loadBuiltinFont(selection.id);
    return;
  }
  if (selection.kind === 'google') {
    const family = sanitizeGoogleFamily(selection.family);
    if (!family) return;
    await loadGoogleFont(family);
    return;
  }
  await loadUploadedFont(selection.id);
}
