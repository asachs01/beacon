import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { applyFontPreferences, resolveFontStack, type FontRuntime } from './apply';
import { loadUploadedFont, registerFontFace } from './load';
import {
  BUILTIN_FONT_IDS,
  DEFAULT_BODY_FONT,
  DEFAULT_HEADING_FONT,
  SYSTEM_FONT_STACK,
  intendedStack,
  normalizeFontSelection,
  type FontSelection,
} from './selection';
import type { FontFileStore } from './store';
import { readValidWoff2 } from './woff2';

const runtime = (load: FontRuntime['load'], timeoutMs = 50): FontRuntime => ({ load, timeoutMs });

function woff2File(bytes: number[], name: string, type = ''): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

const WOFF2_MAGIC = [0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 1];

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty('--font-family-heading');
  document.documentElement.style.removeProperty('--font-family-body');
});

describe('font stacks', () => {
  it('ends every built-in, Google, and upload stack in the system font stack', () => {
    for (const id of BUILTIN_FONT_IDS) {
      expect(intendedStack({ kind: 'builtin', id }).endsWith(SYSTEM_FONT_STACK)).toBe(true);
    }
    expect(intendedStack({ kind: 'google', family: 'Roboto' }).endsWith(SYSTEM_FONT_STACK)).toBe(true);
    expect(
      intendedStack({ kind: 'upload', id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }).endsWith(SYSTEM_FONT_STACK),
    ).toBe(true);
  });

  it('uses the system stack alone for the system choice and for an unsafe family name', () => {
    expect(intendedStack({ kind: 'builtin', id: 'system' })).toBe(SYSTEM_FONT_STACK);
    expect(intendedStack({ kind: 'google', family: 'Roboto"; color: red' })).toBe(SYSTEM_FONT_STACK);
  });

  it('keeps the current app faces as the defaults', () => {
    expect(intendedStack(DEFAULT_HEADING_FONT).startsWith('"Fraunces"')).toBe(true);
    expect(intendedStack(DEFAULT_BODY_FONT).startsWith('"Inter"')).toBe(true);
  });

  it('tokens.css defines the same system stack the loader falls back to', () => {
    const tokens = readFileSync(path.join(__dirname, '../styles/tokens.css'), 'utf8');
    expect(tokens).toContain('--font-family-heading:');
    expect(tokens).toContain('--font-family-body:');
    expect(tokens).toContain(SYSTEM_FONT_STACK);
  });
});

describe('bundled faces stay local', () => {
  it('loads latin woff2 files only and does not call a CDN for built-ins', () => {
    const source = readFileSync(path.join(__dirname, 'load.ts'), 'utf8');
    const builtinSection = source.slice(0, source.indexOf('function ensurePreconnect'));
    expect(builtinSection).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    expect(builtinSection).not.toMatch(/\.woff(?!2)/);
    expect(builtinSection).not.toMatch(/\.ttf|\.otf/);
    const imports = builtinSection.match(/@fontsource[^'"]+\.woff2\?url/g) ?? [];
    expect(imports.length).toBeGreaterThanOrEqual(8);
    for (const specifier of imports) {
      expect(specifier).toContain('latin');
      expect(specifier.endsWith('.woff2?url')).toBe(true);
    }
  });

  it('does not pull Google Fonts from the main stylesheet', () => {
    const beacon = readFileSync(path.join(__dirname, '../styles/beacon.css'), 'utf8');
    expect(beacon).not.toContain('fonts.googleapis.com');
    expect(beacon).not.toContain('fonts.gstatic.com');
  });
});

describe('woff2 validation', () => {
  it('accepts a small file with the wOF2 signature', async () => {
    const result = await readValidWoff2(woff2File(WOFF2_MAGIC, 'Family.woff2', 'font/woff2'));
    expect(result.ok).toBe(true);
  });

  it('rejects the wrong type, an oversized file, and a fake header', async () => {
    const wrongType = await readValidWoff2(woff2File(WOFF2_MAGIC, 'notes.txt', 'text/plain'));
    expect(wrongType).toEqual({ ok: false, error: 'type' });

    const oversized = await readValidWoff2(
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.woff2', { type: 'font/woff2' }),
    );
    expect(oversized).toEqual({ ok: false, error: 'size' });

    const fake = await readValidWoff2(woff2File([0, 1, 2, 3, 4, 5, 6, 7], 'font.woff2'));
    expect(fake).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('font load fallback', () => {
  it('reverts to the system stack when FontFace.load rejects', async () => {
    class RejectingFontFace {
      load(): Promise<FontFace> {
        return Promise.reject(new Error('FontFace failed'));
      }
    }
    vi.stubGlobal('FontFace', RejectingFontFace);
    if (!document.fonts) {
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { add() {}, load: async () => [], check: () => false },
      });
    }

    const store: FontFileStore = {
      get: async () => ({ id: 'abc', fileName: 'Custom.woff2', data: new ArrayBuffer(8) }),
      put: async () => {},
      delete: async () => {},
    };
    const selection: FontSelection = { kind: 'upload', id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' };
    await expect(registerFontFace({
      key: 'test-reject',
      family: 'Beacon Custom',
      source: new ArrayBuffer(4),
      weight: '400',
    })).rejects.toThrow(/FontFace failed/);

    const resolved = await resolveFontStack(selection, runtime(() => loadUploadedFont(selection.id, store)));
    expect(resolved.fellBack).toBe(true);
    expect(resolved.stack).toBe(SYSTEM_FONT_STACK);
  });

  it('reverts to the system stack when loading times out', async () => {
    const resolved = await resolveFontStack(
      { kind: 'google', family: 'Roboto' },
      runtime(() => new Promise(() => {}), 20),
    );
    expect(resolved.fellBack).toBe(true);
    expect(resolved.stack).toBe(SYSTEM_FONT_STACK);
  });

  it('writes the fallback stacks onto the font tokens', async () => {
    const status = await applyFontPreferences(
      { kind: 'builtin', id: 'lexend' },
      { kind: 'builtin', id: 'nunito' },
      runtime(async () => {
        throw new Error('FontFace failed');
      }),
    );
    expect(status).toEqual({ headingFellBack: true, bodyFellBack: true });
    expect(document.documentElement.style.getPropertyValue('--font-family-heading').trim())
      .toBe(SYSTEM_FONT_STACK);
    expect(document.documentElement.style.getPropertyValue('--font-family-body').trim())
      .toBe(SYSTEM_FONT_STACK);
  });

  it('keeps a face that loads and does not fetch anything for the system choice', async () => {
    let calls = 0;
    const resolved = await resolveFontStack(
      { kind: 'builtin', id: 'fraunces' },
      runtime(async () => {
        calls += 1;
      }),
    );
    expect(calls).toBe(1);
    expect(resolved.fellBack).toBe(false);
    expect(resolved.stack.startsWith('"Fraunces"')).toBe(true);
    expect(resolved.stack.endsWith(SYSTEM_FONT_STACK)).toBe(true);

    calls = 0;
    const system = await resolveFontStack({ kind: 'builtin', id: 'system' }, runtime(async () => {
      calls += 1;
    }));
    expect(calls).toBe(0);
    expect(system.stack).toBe(SYSTEM_FONT_STACK);
    expect(system.fellBack).toBe(false);
  });
});

describe('normalizeFontSelection', () => {
  it('drops shapes that are not a known choice', () => {
    expect(normalizeFontSelection({ kind: 'builtin', id: 'comic-sans' }, DEFAULT_BODY_FONT))
      .toEqual(DEFAULT_BODY_FONT);
    expect(normalizeFontSelection({ kind: 'upload', id: '../etc/passwd' }, DEFAULT_HEADING_FONT))
      .toEqual(DEFAULT_HEADING_FONT);
    expect(normalizeFontSelection({ kind: 'google', family: '  Roboto  ' }, DEFAULT_BODY_FONT))
      .toEqual({ kind: 'google', family: 'Roboto' });
  });
});
