/**
 * Serve the demo build and write stable screen captures for the docs site.
 * `npm run docs:screenshots` typechecks, builds with --mode demo, then runs this.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'docs-site/public/docs/images/screenshots');
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;

const fixtures = readFileSync(path.join(root, 'src/demo/fixtures.ts'), 'utf8');
const instant = fixtures.match(/export const DEMO_INSTANT = '([^']+)'/)?.[1];
const timeZone = fixtures.match(/export const DEMO_TIME_ZONE = '([^']+)'/)?.[1];
if (!instant || !timeZone) {
  throw new Error('DEMO_INSTANT / DEMO_TIME_ZONE missing from src/demo/fixtures.ts');
}

const REQUIRED = [
  'calendar-week.png',
  'dashboard.png',
  'chores.png',
  'meals.png',
  'grocery.png',
  'settings-display.png',
  'settings-fonts.png',
  'kid-display.png',
  'themes-light.png',
  'themes-dark.png',
  'calendar-month.png',
  'settings-calendar.png',
  'dashboard-portrait.png',
  'calendar-week-portrait.png',
  'calendar-month-portrait.png',
  'kid-display-portrait.png',
];
const OPTIONAL = ['calendar-day.png'];

const captured = [];
const skipped = [];

function startPreview() {
  const viteBin = path.join(root, 'node_modules/vite/bin/vite.js');
  return spawn(process.execPath, [
    viteBin,
    'preview',
    '--host', '127.0.0.1',
    '--port', String(PORT),
    '--strictPort',
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
}

async function waitForServer(child) {
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode != null) {
      throw new Error(`vite preview exited early\n${log}`);
    }
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`vite preview did not start\n${log}`);
}

async function freezeClock(context) {
  await context.addInitScript((iso) => {
    const fixed = Date.parse(iso);
    const NativeDate = Date;
    class FrozenDate extends NativeDate {
      constructor(...args) {
        if (args.length === 0) super(fixed);
        else super(...args);
      }
      static now() {
        return fixed;
      }
    }
    FrozenDate.parse = NativeDate.parse;
    FrozenDate.UTC = NativeDate.UTC;
    window.Date = FrozenDate;

    let seed = 1;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  }, instant);
}

async function open(page, urlPath, readyText) {
  await page.goto(`${BASE}/${urlPath.replace(/^\//, '')}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    if (document.fonts) await document.fonts.ready;
  });
  const target = page.getByText(readyText, { exact: false }).first();
  await target.waitFor({ state: 'attached', timeout: 15000 });
  // Portrait tablets clip the 4-column chores grid; bring the marker on screen.
  if (!(await target.isVisible())) {
    await target.scrollIntoViewIfNeeded();
  }
  await target.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(200);
}

async function shot(page, name) {
  await page.screenshot({
    path: path.join(OUT, name),
    animations: 'disabled',
    caret: 'hide',
  });
  captured.push(name);
  console.log(`captured ${name}`);
}

async function captureMonth(page, filename) {
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await page.getByText('June 2026').first().waitFor({ timeout: 15000 });
  await page.getByText('Birthday dinner').first().waitFor({ timeout: 15000 });
  await shot(page, filename);
}

async function captureOptionalView(page, label, filename) {
  const button = page.getByRole('button', { name: label, exact: true });
  const marker = page.locator(`[data-calendar-view="${label.toLowerCase()}"]`);
  if (await button.count()) {
    await button.first().click();
    await page.waitForTimeout(200);
    await shot(page, filename);
    return;
  }
  if (await marker.count()) {
    await shot(page, filename);
    return;
  }
  skipped.push(`${filename} — no ${label.toLowerCase()} view`);
  console.log(`skipped ${filename} (no ${label.toLowerCase()} view)`);
}

async function captureLandscape(page) {
  await open(page, '/?view=dashboard', 'Team standup');
  const time = await page.locator('.dash-topbar-time').innerText();
  const date = await page.locator('.dash-topbar-date').innerText();
  if (!time.includes('10:30')) throw new Error(`Expected frozen 10:30, saw "${time}"`);
  if (!date.includes('June 17')) throw new Error(`Expected June 17, saw "${date}"`);
  await page.getByText('Blueberry pancakes').first().waitFor();
  await shot(page, 'dashboard.png');

  await open(page, '/?view=calendar', 'Soccer practice');
  await shot(page, 'calendar-week.png');
  await captureOptionalView(page, 'Day', 'calendar-day.png');
  await captureMonth(page, 'calendar-month.png');

  await open(page, '/?view=chores', 'Feed the dog');
  await shot(page, 'chores.png');

  await open(page, '/?view=dashboard&layout=classic', 'Veggie tacos');
  await page.getByText('This Week').first().waitFor();
  await shot(page, 'meals.png');

  await open(page, '/?view=grocery', 'Milk');
  await shot(page, 'grocery.png');

  await open(page, '/?view=settings&section=calendar', 'Default Calendar View');
  await shot(page, 'settings-calendar.png');

  await open(page, '/?view=settings&section=display', 'Kid Display');
  await shot(page, 'settings-display.png');

  await open(page, '/?view=settings&section=appearance', 'Heading font');
  await page.locator('#settings-fonts').scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await shot(page, 'settings-fonts.png');

  await open(page, '/?display=sam-rivera', 'Brush teeth');
  await shot(page, 'kid-display.png');

  await open(page, '/?theme=skylight&view=dashboard', 'Team standup');
  await page.locator('[data-theme="light"]').waitFor();
  await shot(page, 'themes-light.png');

  await open(page, '/?theme=midnight&view=dashboard', 'Team standup');
  await page.locator('html[data-theme="dark"], [data-theme="dark"]').first().waitFor();
  await shot(page, 'themes-dark.png');
}

async function capturePortrait(page) {
  await open(page, '/?view=dashboard', 'Team standup');
  await shot(page, 'dashboard-portrait.png');

  await open(page, '/?view=calendar', 'Soccer practice');
  await shot(page, 'calendar-week-portrait.png');
  await captureMonth(page, 'calendar-month-portrait.png');

  await open(page, '/?display=sam-rivera', 'Brush teeth');
  await shot(page, 'kid-display-portrait.png');
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const preview = startPreview();
  let browser;
  try {
    browser = await chromium.launch();
    await waitForServer(preview);
    const landscape = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: timeZone,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    await freezeClock(landscape);
    const landscapePage = await landscape.newPage();
    await captureLandscape(landscapePage);
    await landscape.close();

    // 768px is the app's tablet breakpoint: the week view becomes three days
    // and the chores/dashboard columns stack, so portrait frames stay readable.
    const portrait = await browser.newContext({
      viewport: { width: 768, height: 1024 },
      locale: 'en-US',
      timezoneId: timeZone,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    await freezeClock(portrait);
    const portraitPage = await portrait.newPage();
    await capturePortrait(portraitPage);
    await portrait.close();
  } finally {
    await browser?.close();
    preview.kill('SIGTERM');
  }

  for (const name of OPTIONAL) {
    if (!captured.includes(name)) {
      const file = path.join(OUT, name);
      if (existsSync(file)) unlinkSync(file);
    }
  }

  const missing = REQUIRED.filter((name) => !captured.includes(name));
  if (missing.length > 0) {
    throw new Error(`Missing screenshots: ${missing.join(', ')}`);
  }
  if (skipped.length > 0) {
    console.log('Not captured:');
    for (const line of skipped) console.log(`  ${line}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
