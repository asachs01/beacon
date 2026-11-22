/**
 * Release notes for the What's New page.
 * GitHub's public releases API is preferred. CHANGELOG.md is the fallback
 * so a rate limit or outage cannot fail the docs build.
 */

export interface ReleaseNote {
  version: string;
  date: string;
  notes: string;
}

export interface WhatsNew {
  source: 'github' | 'changelog';
  releases: ReleaseNote[];
}

const REPO = 'asachs01/beacon';
const LIMIT = 20;

export function parseChangelog(markdown: string, limit = LIMIT): ReleaseNote[] {
  const releases: { version: string; date: string; lines: string[] }[] = [];
  let current: { version: string; date: string; lines: string[] } | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,2} \[([^\]]+)\](?:\([^)]*\))? \((\d{4}-\d{2}-\d{2})\)\s*$/);
    if (match) {
      if (current) releases.push(current);
      current = { version: match[1], date: match[2], lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) releases.push(current);

  return releases.slice(0, limit).map((release) => ({
    version: release.version.replace(/^v/, ''),
    date: release.date,
    notes: trimNotes(release.lines.join('\n')),
  }));
}

function trimNotes(notes: string): string {
  return notes.replace(/^\n+/, '').replace(/\n+$/, '');
}

interface LoadOptions {
  fetchImpl?: typeof fetch;
  changelogText?: string;
  token?: string;
}

export async function loadWhatsNew(options: LoadOptions = {}): Promise<WhatsNew> {
  const changelogText = options.changelogText ?? (await readChangelog());
  try {
    const releases = await fetchGitHubReleases(options.fetchImpl ?? fetch, options.token ?? tokenFromEnv());
    if (releases.length > 0) return { source: 'github', releases };
  } catch (err) {
    console.warn('What\'s New: GitHub releases unavailable, using CHANGELOG.md.', err);
  }
  return { source: 'changelog', releases: parseChangelog(changelogText) };
}

function tokenFromEnv(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
}

async function readChangelog(): Promise<string> {
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.resolve(here, '../../../CHANGELOG.md'), 'utf8');
}

async function fetchGitHubReleases(fetchImpl: typeof fetch, token?: string): Promise<ReleaseNote[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'beacon-docs',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchImpl(
    `https://api.github.com/repos/${REPO}/releases?per_page=${LIMIT}`,
    { headers, signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) {
    throw new Error(`GitHub releases responded ${response.status}`);
  }
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) throw new Error('GitHub releases response was not a list');

  return body.slice(0, LIMIT).map((entry) => {
    const release = entry as { tag_name?: string; name?: string; published_at?: string; body?: string | null };
    const version = String(release.tag_name || release.name || '').replace(/^v/, '');
    const date = String(release.published_at || '').slice(0, 10);
    return {
      version,
      date,
      notes: trimNotes(release.body || ''),
    };
  }).filter((release) => release.version);
}

export function formatReleaseDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
