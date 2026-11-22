/**
 * Fail when the built docs site disagrees with SITE_URL.
 *
 * Checks canonical links, og:url / og:image (and Twitter twins), sitemap
 * <loc> entries, the robots.txt Sitemap line, JSON-LD site URLs, and docs
 * links in llms.txt. Also fails if the docs-site source hardcodes the
 * default host outside site.config.mjs.
 *
 *   node scripts/check-docs-site-urls.mjs --self-test
 *   node scripts/check-docs-site-urls.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SITE_URL,
  SITE_URL,
  SITE_URL_TOKEN,
  absoluteUrl,
  applySiteUrl,
  normalizeSiteUrl,
  urlBelongsToSite,
} from '../docs-site/site.config.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(repoRoot, 'docs-site');
const distRoot = path.join(docsRoot, 'dist');

const DOCS_PATH = /^\/(?:$|llms\.txt$|llms-full\.txt$|robots\.txt$|sitemap(?:-[^/]+)?\.xml$|docs\/)/;
const SITE_KEYS = new Set(['url', 'softwareHelp', 'image', 'thumbnailUrl', '@id', 'mainEntityOfPage']);
const TEXT_FILE = /\.(mjs|cjs|js|ts|astro|json|txt|md|mdx|yml|yaml|css|html|svg)$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function decodeAttr(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function elements(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))].map((match) => match[0]);
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  if (!match) return null;
  return decodeAttr(match[1] ?? match[2]);
}

function expectSiteUrl(value, where, siteUrl, errors) {
  if (!urlBelongsToSite(value, siteUrl)) {
    errors.push(`${where} uses ${JSON.stringify(value)}, which is not under SITE_URL ${siteUrl}`);
  }
}

function htmlErrors(html, rel, siteUrl) {
  const errors = [];
  const isRedirect = /http-equiv\s*=\s*["']refresh["']/i.test(html);
  const canonicals = elements(html, 'link').filter((tag) =>
    attribute(tag, 'rel')?.split(/\s+/).includes('canonical'),
  );
  if (canonicals.length === 0) errors.push(`${rel} is missing a canonical link`);
  for (const tag of canonicals) {
    expectSiteUrl(attribute(tag, 'href') ?? '', `${rel} canonical`, siteUrl, errors);
  }

  const metas = elements(html, 'meta');
  const required = isRedirect ? [] : ['og:url', 'og:image'];
  for (const name of required) {
    const tags = metas.filter((tag) => attribute(tag, 'property') === name || attribute(tag, 'name') === name);
    if (tags.length === 0) errors.push(`${rel} is missing ${name}`);
    for (const tag of tags) {
      expectSiteUrl(attribute(tag, 'content') ?? '', `${rel} ${name}`, siteUrl, errors);
    }
  }
  for (const name of ['twitter:url', 'twitter:image']) {
    const tags = metas.filter((tag) => attribute(tag, 'name') === name || attribute(tag, 'property') === name);
    for (const tag of tags) {
      expectSiteUrl(attribute(tag, 'content') ?? '', `${rel} ${name}`, siteUrl, errors);
    }
  }

  const scripts = [
    ...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  scripts.forEach((match, index) => {
    let data;
    try {
      data = JSON.parse(match[1]);
    } catch {
      errors.push(`${rel} JSON-LD block ${index + 1} is not valid JSON`);
      return;
    }
    walkJsonLd(data, `${rel} JSON-LD`, siteUrl, errors);
  });
  return errors;
}

function walkJsonLd(value, where, siteUrl, errors) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkJsonLd(item, `${where}[${index}]`, siteUrl, errors));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SITE_KEYS.has(key)) {
      if (typeof child === 'string') expectSiteUrl(child, `${where}.${key}`, siteUrl, errors);
      else if (child && typeof child === 'object' && typeof child.url === 'string') {
        expectSiteUrl(child.url, `${where}.${key}.url`, siteUrl, errors);
      }
    }
    walkJsonLd(child, `${where}.${key}`, siteUrl, errors);
  }
}

function xmlLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => decodeAttr(match[1].trim()));
}

function robotsErrors(text, rel, siteUrl) {
  const match = text.match(/^Sitemap:\s*(\S+)\s*$/im);
  if (!match) return [`${rel} is missing a Sitemap line`];
  const expected = absoluteUrl('sitemap-index.xml', siteUrl);
  if (match[1] !== expected) return [`${rel} Sitemap is ${match[1]}, expected ${expected}`];
  return [];
}

function isDocsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.host === new URL(DEFAULT_SITE_URL).host) return true;
  return DOCS_PATH.test(url.pathname);
}

function llmsErrors(text, rel, siteUrl) {
  const errors = [];
  if (text.includes(SITE_URL_TOKEN)) errors.push(`${rel} still contains ${SITE_URL_TOKEN}`);
  if (!text.includes(siteUrl)) errors.push(`${rel} does not include SITE_URL ${siteUrl}`);
  const urls = text.match(/https?:\/\/[^\s<>)"']+/g) ?? [];
  for (const raw of urls) {
    const value = raw.replace(/[.,]$/, '');
    if (!isDocsUrl(value)) continue;
    if (!urlBelongsToSite(value, siteUrl)) {
      errors.push(`${rel} docs URL ${value} is not under SITE_URL ${siteUrl}`);
    }
  }
  return errors;
}

function isPagefind(rel) {
  return rel.split('/').includes('pagefind');
}

export function checkEntries(entries, siteUrl) {
  const errors = [];
  let htmlCount = 0;
  let sitemapLocs = 0;
  let sawRobots = false;
  let sawLlms = false;
  let sawLlmsFull = false;

  for (const entry of entries) {
    const rel = entry.path.replaceAll('\\', '/');
    if (isPagefind(rel)) continue;
    if (rel.endsWith('.html')) {
      htmlCount += 1;
      errors.push(...htmlErrors(entry.text, rel, siteUrl));
    } else if (/sitemap[^/]*\.xml$/.test(rel)) {
      const locs = xmlLocs(entry.text);
      sitemapLocs += locs.length;
      for (const loc of locs) {
        if (!urlBelongsToSite(loc, siteUrl)) {
          errors.push(`${rel} loc ${loc} is not under SITE_URL ${siteUrl}`);
        }
      }
    } else if (rel.endsWith('/robots.txt') || rel === 'robots.txt') {
      sawRobots = true;
      errors.push(...robotsErrors(entry.text, rel, siteUrl));
    } else if (rel.endsWith('/llms-full.txt') || rel === 'llms-full.txt') {
      sawLlmsFull = true;
      errors.push(...llmsErrors(entry.text, rel, siteUrl));
    } else if (rel.endsWith('/llms.txt') || rel === 'llms.txt') {
      sawLlms = true;
      errors.push(...llmsErrors(entry.text, rel, siteUrl));
    }
  }

  if (htmlCount === 0) errors.push('no HTML pages in docs output');
  if (sitemapLocs === 0) errors.push('no sitemap <loc> entries in docs output');
  if (!sawRobots) errors.push('robots.txt missing from docs output');
  if (!sawLlms) errors.push('llms.txt missing from docs output');
  if (!sawLlmsFull) errors.push('llms-full.txt missing from docs output');
  return errors;
}

async function walkFiles(dir, skipNames) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipNames.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(full, skipNames)));
    else files.push(full);
  }
  return files;
}

async function distErrors(siteUrl) {
  let files;
  try {
    files = await walkFiles(distRoot, new Set());
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [`${path.relative(repoRoot, distRoot)} is missing. Build the docs site first.`];
    }
    throw error;
  }
  const entries = [];
  for (const file of files) {
    const rel = path.relative(distRoot, file).replaceAll('\\', '/');
    if (isPagefind(rel)) continue;
    if (!/\.(html|xml|txt)$/.test(rel)) continue;
    entries.push({ path: rel, text: await readFile(file, 'utf8') });
  }
  return checkEntries(entries, siteUrl);
}

async function sourceHostErrors() {
  const host = new URL(DEFAULT_SITE_URL).host;
  const allowed = new Set([path.normalize('site.config.mjs')]);
  const errors = [];
  const files = await walkFiles(docsRoot, new Set(['node_modules', 'dist', '.astro']));
  for (const file of files) {
    if (!TEXT_FILE.test(file)) continue;
    const rel = path.relative(docsRoot, file);
    if (allowed.has(path.normalize(rel))) continue;
    const text = await readFile(file, 'utf8');
    if (text.includes(host)) {
      errors.push(`docs-site/${rel} hardcodes ${host}; read it from docs-site/site.config.mjs`);
    }
  }
  return errors;
}

function selfTest() {
  const site = 'https://docs.example';
  assert(normalizeSiteUrl('') === DEFAULT_SITE_URL, 'blank SITE_URL uses the default');
  assert(normalizeSiteUrl('https://docs.example/') === 'https://docs.example', 'trailing slash is stripped');
  assert(normalizeSiteUrl('https://docs.example/docs/') === 'https://docs.example/docs', 'path prefix is kept');
  for (const invalid of ['javascript:alert(1)', 'https://user:pass@docs.example', 'https://docs.example/path?q=1']) {
    let threw = false;
    try {
      normalizeSiteUrl(invalid);
    } catch {
      threw = true;
    }
    assert(threw, `expected SITE_URL ${invalid} to be rejected`);
  }
  assert(urlBelongsToSite(`${site}/docs/a/`, site), 'same origin belongs');
  assert(!urlBelongsToSite('https://evil.example/docs/a/', site), 'other origin does not belong');
  assert(urlBelongsToSite('https://docs.example/beacon/docs/a/', 'https://docs.example/beacon'), 'path prefix belongs');
  assert(!urlBelongsToSite('https://docs.example/other/', 'https://docs.example/beacon'), 'sibling path does not belong');
  assert(
    applySiteUrl(`Docs: ${SITE_URL_TOKEN}/llms.txt`, site) === `Docs: ${site}/llms.txt`,
    'token is replaced',
  );
  assert(
    applySiteUrl(`Docs: ${DEFAULT_SITE_URL}/docs/x/`, site) === `Docs: ${site}/docs/x/`,
    'default host is replaced',
  );

  const goodHtml = `<!doctype html>
    <link rel="canonical" href="${site}/docs/a/">
    <meta property="og:url" content="${site}/docs/a/">
    <meta content="${site}/og-image.png" property="og:image">
    <meta name="twitter:url" content="${site}/docs/a/">
    <meta name="twitter:image" content="${site}/og-image.png">
    <script type="application/ld+json">{"@context":"https://schema.org","url":"${site}/","softwareHelp":"${site}/","license":"https://opensource.org/licenses/MIT","codeRepository":"https://github.com/asachs01/beacon"}</script>`;
  const good = checkEntries(
    [
      { path: 'index.html', text: goodHtml },
      { path: 'sitemap-index.xml', text: `<sitemapindex><sitemap><loc>${site}/sitemap-0.xml</loc></sitemap></sitemapindex>` },
      { path: 'sitemap-0.xml', text: `<urlset><url><loc>${site}/docs/a/</loc></url></urlset>` },
      { path: 'robots.txt', text: `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl('sitemap-index.xml', site)}\n` },
      { path: 'llms.txt', text: `Docs: ${site}\n- [Start](${site}/docs/a/): text\nSource: https://github.com/asachs01/beacon\n` },
      { path: 'llms-full.txt', text: `Docs: ${site}\nURL: ${site}/docs/a/\n(\`https://photos.google.com/share/example\`)\n` },
    ],
    site,
  );
  assert(good.length === 0, `expected no errors, got:\n${good.join('\n')}`);

  const wrongHost = DEFAULT_SITE_URL;
  const bad = checkEntries(
    [
      { path: 'index.html', text: goodHtml.replaceAll(site, wrongHost) },
      { path: 'sitemap-0.xml', text: `<loc>${wrongHost}/docs/a/</loc>` },
      { path: 'robots.txt', text: `Sitemap: ${wrongHost}/sitemap-index.xml\n` },
      { path: 'llms.txt', text: `Docs: ${SITE_URL_TOKEN}\n- [Start](${wrongHost}/docs/a/)\n` },
      { path: 'llms-full.txt', text: `Docs: ${site}\nURL: ${site}/docs/a/\n` },
    ],
    site,
  );
  for (const needle of ['canonical', 'og:url', 'og:image', 'sitemap-0.xml', 'robots.txt', SITE_URL_TOKEN, 'JSON-LD.url']) {
    assert(bad.some((error) => error.includes(needle)), `expected an error containing ${needle}, got:\n${bad.join('\n')}`);
  }

  const relative = htmlErrors(
    '<link rel="canonical" href="/docs/a/"><meta property="og:url" content="/docs/a/"><meta property="og:image" content="/og.png">',
    'page.html',
    site,
  );
  assert(relative.length >= 3, 'relative canonical and og URLs should fail');

  const missing = htmlErrors('<p>no tags</p>', 'bare.html', site);
  assert(missing.some((error) => error.includes('missing a canonical link')), 'missing canonical should fail');
  assert(missing.some((error) => error.includes('missing og:url')), 'missing og:url should fail');
  assert(missing.some((error) => error.includes('missing og:image')), 'missing og:image should fail');

  const redirect = htmlErrors(
    `<meta http-equiv="refresh" content="0;url=/docs/"><link rel="canonical" href="${site}/docs/">`,
    'redirect.html',
    site,
  );
  assert(redirect.length === 0, `redirect page should allow missing og tags, got:\n${redirect.join('\n')}`);

  console.log('docs site URL self-test passed');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }

  const errors = [...(await sourceHostErrors()), ...(await distErrors(SITE_URL))];
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    console.error(`Docs site URL check failed (${errors.length}). SITE_URL is ${SITE_URL}.`);
    process.exit(1);
  }
  console.log(`Docs site URL check passed for ${SITE_URL}`);
}

await main();
