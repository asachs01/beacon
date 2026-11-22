import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadWhatsNew, parseChangelog } from './whats-new';

const changelog = readFileSync('CHANGELOG.md', 'utf8');

describe('what\'s new notes', () => {
  it('parses the latest changelog releases', () => {
    const releases = parseChangelog(changelog);
    expect(releases.length).toBeGreaterThan(0);
    expect(releases.length).toBeLessThanOrEqual(20);
    expect(releases[0]).toMatchObject({ version: '1.43.2', date: '2026-11-22' });
    expect(releases[0].notes).toContain('GHCR');
  });

  it('falls back to the changelog when GitHub fails', async () => {
    const result = await loadWhatsNew({
      changelogText: changelog,
      fetchImpl: async () => {
        throw new Error('rate limited');
      },
    });
    expect(result.source).toBe('changelog');
    expect(result.releases[0].version).toBe('1.43.2');
  });

  it('uses the GitHub payload when the API responds', async () => {
    const result = await loadWhatsNew({
      changelogText: changelog,
      fetchImpl: async () => new Response(JSON.stringify([
        {
          tag_name: 'v9.9.9',
          published_at: '2026-01-02T03:04:05Z',
          body: 'Hello from GitHub',
        },
      ]), { status: 200 }),
    });
    expect(result.source).toBe('github');
    expect(result.releases).toEqual([
      { version: '9.9.9', date: '2026-01-02', notes: 'Hello from GitHub' },
    ]);
  });
});
