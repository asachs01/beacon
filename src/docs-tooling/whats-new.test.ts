import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadWhatsNew, parseChangelog } from './whats-new';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureChangelog = readFileSync(join(here, '__fixtures__/CHANGELOG.sample.md'), 'utf8');
const repoChangelog = readFileSync(join(here, '../../CHANGELOG.md'), 'utf8');

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('what\'s new notes', () => {
  it('parses fixed releases from the sample changelog', () => {
    const releases = parseChangelog(fixtureChangelog);
    expect(releases.map((release) => release.version)).toEqual(['9.8.0', '9.7.1', '9.7.0']);
    expect(releases[0]).toMatchObject({ version: '9.8.0', date: '2024-03-15' });
    expect(releases[0].notes).toContain('fixture release notes for the changelog parser');
    expect(releases[1]).toMatchObject({ version: '9.7.1', date: '2024-02-02' });
    expect(releases[1].notes).toContain('fixture GHCR image note');
    expect(releases[2]).toMatchObject({ version: '9.7.0', date: '2024-01-09' });
    expect(parseChangelog(fixtureChangelog, 1)).toHaveLength(1);
  });

  it('parses the repo changelog without pinning a version', () => {
    const releases = parseChangelog(repoChangelog);
    expect(releases.length).toBeGreaterThan(0);
    expect(releases.length).toBeLessThanOrEqual(20);
    expect(releases[0].version).toMatch(SEMVER);
    expect(releases[0].date).toMatch(ISO_DATE);
    for (const release of releases) {
      expect(release.version).toMatch(SEMVER);
      expect(release.date).toMatch(ISO_DATE);
      expect(release.notes).toEqual(expect.any(String));
    }
  });

  it('falls back to the changelog when GitHub fails', async () => {
    const result = await loadWhatsNew({
      changelogText: fixtureChangelog,
      fetchImpl: async () => {
        throw new Error('rate limited');
      },
    });
    expect(result.source).toBe('changelog');
    expect(result.releases[0].version).toBe('9.8.0');
    expect(result.releases[0].date).toBe('2024-03-15');
  });

  it('uses the GitHub payload when the API responds', async () => {
    const result = await loadWhatsNew({
      changelogText: fixtureChangelog,
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
