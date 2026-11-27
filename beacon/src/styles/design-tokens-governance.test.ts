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

