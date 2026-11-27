import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { midnight } from './themes/midnight';
import { midnightLight } from './themes/midnight-light';

/**
 * Design-token governance test.
 *
 * A code review of the icon/tokens/typography PR caught src/styles/tokens.css
 * defining a 10-role color system that NOTHING in the codebase actually
 * consumed — docs/design-tokens.md read as if it were an enforced system,
 * but a grep across src/ turned up zero references to any --color-* custom
 * property. That's exactly the kind of drift a human reviewer catches once
 * and a CI run should catch every time after.
 *
 * This test doesn't assert *which* files use the tokens (that would make it
 * brittle against legitimate refactors) — it asserts that AT LEAST ONE real
 * consumer exists for each token: either a CSS `var(--token)` reference in a
 * stylesheet, OR the token's literal hex value appearing in a TypeScript
 * color map (types.ts CALENDAR_COLORS/PASTEL_MAP legitimately can't consume
 * CSS custom properties directly — TS needs literal string values — so a hex
 * match there counts as a real, intentional consumer, not orphaning).
 */

const STYLES_DIR = path.resolve(__dirname, '.');
const SRC_DIR = path.resolve(__dirname, '..');
const TOKENS_FILE = path.join(STYLES_DIR, 'tokens.css');
const TYPES_FILE = path.join(SRC_DIR, 'types.ts');

function readAllStylesheets(): { file: string; content: string }[] {
  const files = readdirSync(STYLES_DIR).filter((f) => f.endsWith('.css'));
  return files.map((f) => ({
    file: f,
    content: readFileSync(path.join(STYLES_DIR, f), 'utf-8'),
  }));
}

function extractTokens(cssContent: string): { name: string; hex: string }[] {
  const matches = cssContent.matchAll(/(--color-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g);
  return Array.from(matches, (m) => ({ name: m[1], hex: m[2].toLowerCase() }));
}

describe('design tokens are wired up, not orphaned', () => {
  const tokensCss = readFileSync(TOKENS_FILE, 'utf-8');
  const tokens = extractTokens(tokensCss);
  const otherStylesheets = readAllStylesheets().filter((s) => s.file !== 'tokens.css');
  const allOtherCss = otherStylesheets.map((s) => s.content).join('\n');
  const typesTs = readFileSync(TYPES_FILE, 'utf-8').toLowerCase();

  it('tokens.css actually defines the expected 10-role token set', () => {
    expect(tokens.length).toBeGreaterThanOrEqual(10);
    expect(tokens.map((t) => t.name)).toContain('--color-warning');
    expect(tokens.map((t) => t.name)).toContain('--color-brand');
  });

  it.each(
    // Base neutrals are allowed to stay unconsumed outside tokens.css for now
    // (ink/paper largely duplicate existing --bg-primary/--text-primary
    // tokens). --color-brand is also exempt: it's the Beacon logo mark's
    // gold, which lives in src/assets/*.svg (raw SVG fill attributes, not
    // CSS) by design — see beacon-app-icon.svg. Every semantic + category
    // color still must have a real CSS/TS consumer, since those are what
    // the design review flagged as needing enforcement (Warning/Brand hex
    // collision, category color governance).
    tokens.filter(
      (t) => !['--color-ink', '--color-paper', '--color-brand'].includes(t.name),
    ),
  )('$name is referenced by a stylesheet var() OR types.ts as a literal hex', ({ name, hex }) => {
    const referencedInCss = allOtherCss.includes(`var(${name}`);
    const referencedInTypes = typesTs.includes(hex);
    expect(
      referencedInCss || referencedInTypes,
      `${name} (${hex}) is defined in tokens.css but never consumed anywhere else — ` +
        `neither a var(${name}) reference in another stylesheet nor a literal ${hex} ` +
        `in types.ts. This is exactly the "orphaned token layer" bug flagged in code ` +
        `review. Either wire it into a real consumer or remove it from tokens.css.`,
    ).toBe(true);
  });

  it('--color-brand matches the literal gold used in the app icon SVG (its one legitimate consumer)', () => {
    const iconSvg = readFileSync(
      path.join(SRC_DIR, 'assets', 'beacon-app-icon.svg'),
      'utf-8',
    ).toLowerCase();
    const brandToken = tokens.find((t) => t.name === '--color-brand');
    expect(brandToken).toBeDefined();
    expect(iconSvg).toContain(brandToken!.hex);
  });

  it('--color-warning is never aliased back to --color-brand\'s hex value in a live rule', () => {
    // Regression guard for the specific bug: warning state visually
    // identical to the brand mark. #f7a832 is brand gold; warning must be
    // its own hue (#d97706) everywhere it's used as a literal fallback.
    const warning = tokens.find((t) => t.name === '--color-warning');
    const brand = tokens.find((t) => t.name === '--color-brand');
    expect(warning?.hex).not.toBe('#f7a832');
    expect(warning?.hex).not.toBe(brand?.hex);
    const warningFallbackPattern = /--color-warning,\s*#f7a832\)/i;
    expect(warningFallbackPattern.test(allOtherCss)).toBe(false);
  });

  it('does not reintroduce the retired brand gold #f59e0b in themes or tokens.css', () => {
    const themesDir = path.join(STYLES_DIR, 'themes');
    const themeFiles = readdirSync(themesDir).filter((file) => file.endsWith('.ts'));
    for (const file of themeFiles) {
      const content = readFileSync(path.join(themesDir, file), 'utf-8');
      expect(content.toLowerCase(), file).not.toContain('#f59e0b');
    }
    expect(tokensCss.toLowerCase()).not.toContain('#f59e0b');
  });

  it('Beacon Dark and Beacon Light accents match --color-brand', () => {
    const brand = tokens.find((t) => t.name === '--color-brand');
    expect(brand).toBeDefined();
    expect(midnight.colors.accent.toLowerCase()).toBe(brand!.hex);
    expect(midnightLight.colors.accent.toLowerCase()).toBe(brand!.hex);
    // White on #f7a832 is ~1.98:1. On-accent text is navy.
    expect(midnight.colors.accentForeground?.toLowerCase()).toBe('#101d3c');
    expect(midnightLight.colors.accentForeground?.toLowerCase()).toBe('#101d3c');
  });

  it('defines heading and body font tokens that end in the system font stack', () => {
    expect(tokensCss).toMatch(/--font-family-heading:[^;]*system-ui[^;]*sans-serif/);
    expect(tokensCss).toMatch(/--font-family-body:[^;]*system-ui[^;]*sans-serif/);
  });

  it('stylesheets consume --font-family-heading and --font-family-body', () => {
    expect(allOtherCss).toContain('var(--font-family-heading)');
    expect(allOtherCss).toContain('var(--font-family-body)');
  });
});

/** WCAG 2 relative luminance contrast for two #rrggbb colors. */
function contrastRatio(foreground: string, background: string): number {
  const lum = (hex: string) => {
    const h = hex.replace('#', '');
    const channel = (pair: string) => {
      const s = parseInt(pair, 16) / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const r = channel(h.slice(0, 2));
    const g = channel(h.slice(2, 4));
    const b = channel(h.slice(4, 6));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const lighter = Math.max(lum(foreground), lum(background));
  const darker = Math.min(lum(foreground), lum(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function walkFiles(dir: string, extension: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(full, extension));
    else if (entry.name.endsWith(extension)) found.push(full);
  }
  return found;
}

function stripComments(source: string, jsx: boolean): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return jsx ? withoutBlocks.replace(/(^|[^:])\/\/.*$/gm, '$1') : withoutBlocks;
}

/** True when a gold/accent reference sits inside var(--color-brand-text, ...). */
function insideBrandText(value: string, index: number): boolean {
  const token = 'var(--color-brand-text';
  let from = 0;
  while (from <= index) {
    const start = value.toLowerCase().indexOf(token, from);
    if (start === -1 || start > index) return false;
    const open = value.indexOf('(', start);
    let depth = 0;
    let end = open;
    for (; end < value.length; end++) {
      if (value[end] === '(') depth++;
      else if (value[end] === ')') {
        depth--;
        if (depth === 0) {
          end++;
          break;
        }
      }
    }
    if (index >= start && index < end) return true;
    from = start + token.length;
  }
  return false;
}

const RAW_GOLD = /--accent(?![\w-])|--color-brand(?![\w-])|#f7a832|#f59e0b/gi;

function rawGoldOutsideBrandText(value: string): string[] {
  const hits: string[] = [];
  for (const match of value.matchAll(RAW_GOLD)) {
    if (match.index !== undefined && !insideBrandText(value, match.index)) {
      hits.push(match[0]);
    }
  }
  return hits;
}

describe('Beacon Light brand text', () => {
  it('meets 3:1 against the Beacon Light page and surface', () => {
    expect(midnightLight.colors.brandText?.toLowerCase()).toBe('#9a5b00');
    expect(midnight.colors.brandText?.toLowerCase()).toBe('#f7a832');
    expect(midnightLight.colors.background.toLowerCase()).toBe('#f8fafc');
    expect(midnightLight.colors.surface.toLowerCase()).toBe('#f1f5f9');

    const onPage = contrastRatio(midnightLight.colors.brandText!, midnightLight.colors.background);
    const onSurface = contrastRatio(midnightLight.colors.brandText!, midnightLight.colors.surface);
    expect(onPage, `brand text on page is ${onPage.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    expect(onSurface, `brand text on surface is ${onSurface.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });

  it('does not paint Beacon Light text or icons with raw brand gold or the theme accent', () => {
    const cssFiles = walkFiles(path.join(SRC_DIR, 'styles'), '.css');
    const tsxFiles = walkFiles(SRC_DIR, '.tsx');
    const violations: string[] = [];

    const note = (file: string, value: string, hits: string[]) => {
      if (hits.length > 0) {
        violations.push(`${path.relative(SRC_DIR, file)}: ${value.trim()} (${hits.join(', ')})`);
      }
    };

    for (const file of cssFiles) {
      const source = stripComments(readFileSync(file, 'utf-8'), false);
      // Property name is exactly color, fill, or stroke — not border-color.
      const props = source.matchAll(/(?:^|[^-\w])(color|fill|stroke)\s*:\s*([^;}{]+)/g);
      for (const match of props) {
        note(file, match[2], rawGoldOutsideBrandText(match[2]));
      }
    }

    for (const file of tsxFiles) {
      const source = stripComments(readFileSync(file, 'utf-8'), true);
      const attrs = source.matchAll(/(?:^|[^-\w])(color|fill|stroke)\s*(?:=|:)\s*\{?\s*['"`]([^'"`]+)['"`]/g);
      for (const match of attrs) {
        note(file, match[2], rawGoldOutsideBrandText(match[2]));
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});

