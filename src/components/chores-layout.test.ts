import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

/**
 * The chores board is a row of member columns on a wall tablet and a single
 * scrolling stack at max-width 768px. Two layout bugs lived in that CSS:
 * stacked columns were stuck at min-height 200px while the card list flexed
 * to nothing, and landscape columns were so narrow that titles wrapped one
 * word per line and ran into the edit/delete icons.
 */

const FAMILY_CSS = path.resolve(__dirname, '../styles/family.css');

function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Rule "${selector}" not found in family.css`);
  return match[1];
}

describe('chores board layout', () => {
  const css = readFileSync(FAMILY_CSS, 'utf-8');

  it('keeps landscape columns wide enough for a multi-word title', () => {
    const body = ruleBody(css, '.chores-family-grid');
    expect(body).toMatch(/grid-template-columns:\s*repeat\(var\(--member-count,\s*1\),\s*minmax\(270px,\s*1fr\)\)/);
    expect(body).toMatch(/overflow-x:\s*auto/);
  });

  it('keeps the landscape card list scrolling inside a stretched column', () => {
    const column = ruleBody(css, '.chores-member-col');
    expect(column).toMatch(/min-height:\s*0/);
    expect(column).not.toMatch(/min-height:\s*200px/);
    const list = ruleBody(css, '.chores-member-col-list');
    expect(list).toMatch(/flex:\s*1/);
    expect(list).toMatch(/min-height:\s*0/);
    expect(list).toMatch(/overflow-y:\s*auto/);
  });

  it('lets a stacked column grow with its cards below 768px', () => {
    const parts = css.split('@media (max-width: 768px)');
    const tablet = parts[parts.length - 1];
    expect(tablet, 'trailing tablet media query not found').toMatch(/\.chores-member-col-list/);
    const column = tablet.match(/\.chores-member-col\s*\{([^}]*)\}/);
    const list = tablet.match(/\.chores-member-col-list\s*\{([^}]*)\}/);
    expect(column, 'stacked column override missing').toBeTruthy();
    expect(list, 'stacked list override missing').toBeTruthy();
    expect(column![1]).toMatch(/height:\s*auto/);
    expect(column![1]).not.toMatch(/min-height:\s*200px/);
    expect(column![1]).toMatch(/min-height:\s*auto/);
    expect(list![1]).toMatch(/flex:\s*none/);
    expect(list![1]).toMatch(/overflow:\s*visible/);
    expect(tablet).toMatch(/grid-template-columns:\s*1fr/);
    expect(tablet).toMatch(/grid-auto-rows:\s*max-content/);
  });

  it('gives the chore title the leftover row and keeps icons from shrinking', () => {
    const title = ruleBody(css, '.chore-card-title');
    expect(title).toMatch(/min-width:\s*0/);
    expect(title).toMatch(/flex:\s*1/);
    expect(title).toMatch(/overflow-wrap:\s*break-word/);
    const icon = ruleBody(css, '.chore-card-icon');
    expect(icon).toMatch(/flex-shrink:\s*0/);
    const actions = ruleBody(css, '.chore-card-actions');
    expect(actions).toMatch(/flex-shrink:\s*0/);
    const name = ruleBody(css, '.chore-card-name');
    expect(name).toMatch(/min-width:\s*0/);
  });
});
