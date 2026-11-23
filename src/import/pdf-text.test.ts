import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDF_TEXT_PAGE_CAP, cappedPdfText, choosePdfRoute, pdfRouteForText } from './pdf-text';

const flyer = 'Field trip Friday December 5 at 9am at the museum. Please bring lunch.';

describe('PDF text versus scan', () => {
  it('sends a text PDF through the text path and ignores pages after the cap', () => {
    const pages = [flyer, 'page two has more lunch notes for the class', '', '', '', 'page six should not count'];
    expect(choosePdfRoute(pages)).toBe('text');
    const text = cappedPdfText(pages);
    expect(text).toContain(flyer);
    expect(text).toContain('page two');
    expect(text).not.toContain('page six');
    expect(pages.slice(0, PDF_TEXT_PAGE_CAP)).not.toContain('page six should not count');
  });

  it('treats an empty or nearly empty extract as a scan', () => {
    expect(choosePdfRoute(['', '   ', '\n'])).toBe('scan');
    expect(choosePdfRoute(['Page 1'])).toBe('scan');
    expect(pdfRouteForText('12345')).toBe('scan');
    expect(choosePdfRoute(['', '', '', '', '', flyer])).toBe('scan');
  });

  it('keeps a short but real note on the text path', () => {
    expect(pdfRouteForText('Soccer practice Saturday at 3pm.')).toBe('text');
  });
});

describe('pdfjs stays lazy', () => {
  it('loads pdfjs only through dynamic import()', () => {
    const root = join(import.meta.dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist') continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) files.push(path);
      }
    };
    walk(root);
    const staticHits: string[] = [];
    const dynamicHits: string[] = [];
    for (const path of files) {
      const source = readFileSync(path, 'utf8');
      if (/^\s*import\s+[^;]*pdfjs-dist/m.test(source) || /from\s+['"]pdfjs-dist/.test(source)) {
        staticHits.push(path);
      }
      if (/import\(\s*['"]pdfjs-dist['"]\s*\)/.test(source)) dynamicHits.push(path);
    }
    expect(staticHits).toEqual([]);
    expect(dynamicHits.map((path) => path.replace(root, ''))).toEqual(['/import/pdf-loader.ts']);
    const loader = readFileSync(join(root, 'import/pdf-loader.ts'), 'utf8');
    expect(loader).toMatch(/await import\(\s*['"]\.\/pdf-loader['"]\)|await import\(\s*['"]pdfjs-dist['"]\s*\)/);
    const reader = readFileSync(join(root, 'import/pdf-read.ts'), 'utf8');
    expect(reader).toMatch(/await import\(\s*['"]\.\/pdf-loader['"]\s*\)/);
    expect(reader).not.toMatch(/pdfjs-dist/);
  });
});
