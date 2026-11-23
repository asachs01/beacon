/**
 * Build the settings reference from useSettings defaults, English labels,
 * and the Home Assistant add-on options. The page is committed; CI fails
 * when this output drifts from the source.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const OUTPUT = path.join(root, 'docs-site/src/content/docs/reference/settings.md');

/** label/description keys are English UI strings. A literal is used only when the UI has no locale key. */
const COPY = {
  familyName: { labelKey: 'settings.general.familyNameLabel', descriptionKey: 'settings.general.familyNameSublabel' },
  saveConfigInBrowser: {
    label: 'Save Configuration in Browser',
    description: 'Keep a local browser copy of settings when the add-on allows it.',
  },
  defaultView: { labelKey: 'settings.general.defaultViewLabel', descriptionKey: 'settings.general.defaultViewSublabel' },
  timeFormat: { labelKey: 'settings.general.timeFormatLabel', description: '12-hour or 24-hour clock.' },
  weekStartsOn: { labelKey: 'settings.general.weekStartsOnLabel', description: '0 is Sunday, 1 is Monday.' },
  locale: { labelKey: 'settings.general.languageLabel', description: 'Language for the interface and for formatting dates.' },
  themeId: { labelKey: 'settings.appearance.themeTitle', description: 'Color theme id. The in-app picker overrides the add-on option.' },
  autoDarkMode: { labelKey: 'settings.appearance.autoDarkModeLabel', descriptionKey: 'settings.appearance.autoDarkModeSublabel' },
  darkModeStart: { labelKey: 'settings.appearance.darkModeStartLabel', description: 'Local time (HH:mm) when auto dark mode begins.' },
  darkModeEnd: { labelKey: 'settings.appearance.darkModeEndLabel', description: 'Local time (HH:mm) when auto dark mode ends.' },
  fontScale: { labelKey: 'settings.appearance.fontSizeLabel', descriptionKey: 'settings.appearance.fontSizeSublabel' },
  headingFont: { labelKey: 'settings.appearance.headingFontLabel' },
  bodyFont: { labelKey: 'settings.appearance.bodyFontLabel' },
  sidebarPosition: { labelKey: 'settings.appearance.sidebarPositionLabel', description: 'Which edge the navigation sits on.' },
  defaultCalendarView: { labelKey: 'settings.calendar.defaultViewLabel', descriptionKey: 'settings.calendar.defaultViewSublabel' },
  defaultCalendar: { labelKey: 'settings.calendar.defaultCalendarLabel', description: 'Calendar selected when creating an event.' },
  permanentlyHiddenCalendars: { label: 'Hidden calendars', description: 'Calendar ids hidden from the calendar and dashboard.' },
  calendarColors: { label: 'Calendar colors', description: 'Chosen color for each calendar id. Overrides the automatic palette.' },
  defaultEventDuration: { labelKey: 'settings.calendar.defaultEventDurationLabel', description: 'Length of a new timed event.', unit: 'minutes' },
  notificationMinutes: { labelKey: 'settings.calendar.notificationTimingLabel', description: 'How long before an event Beacon notifies you.', unit: 'minutes' },
  weatherEntity: { labelKey: 'settings.integrations.weatherEntityLabel', descriptionKey: 'settings.integrations.weatherEntitySublabel' },
  grocyEnabled: { labelKey: 'settings.integrations.grocyLabel', descriptionKey: 'settings.integrations.grocySublabel' },
  anylistEnabled: { labelKey: 'settings.integrations.anylistLabel', descriptionKey: 'settings.integrations.anylistSublabel' },
  defaultGroceryList: { labelKey: 'settings.integrations.defaultGroceryListLabel', descriptionKey: 'settings.integrations.defaultGroceryListSublabel' },
  groceryListIds: { labelKey: 'settings.integrations.groceryListsLabel', descriptionKey: 'settings.integrations.groceryListsSublabel' },
  shoppingEntity: { labelKey: 'settings.integrations.shoppingEntityLabel', descriptionKey: 'settings.integrations.shoppingEntitySublabel' },
  musicDefaultPlayer: { labelKey: 'settings.integrations.defaultPlayerLabel', descriptionKey: 'settings.integrations.defaultPlayerSublabel' },
  photoDirectory: { labelKey: 'settings.integrations.sourceDirectoryLabel', descriptionKey: 'settings.integrations.sourceDirectorySublabel' },
  photoInterval: { labelKey: 'settings.integrations.slideshowIntervalLabel', descriptionKey: 'settings.integrations.slideshowIntervalSublabel', unit: 'seconds' },
  photoTransition: { labelKey: 'settings.integrations.transitionStyleLabel', description: 'How the photo frame moves between pictures.' },
  dashboardLayout: { labelKey: 'settings.general.layoutLabel', descriptionKey: 'settings.general.layoutSublabel' },
  advancedDashboard: { labelKey: 'settings.appearance.advancedDashboardLabel', descriptionKey: 'settings.appearance.advancedDashboardSublabel' },
  screenSaverEnabled: { labelKey: 'settings.display.screenSaverLabel', descriptionKey: 'settings.display.screenSaverSublabel' },
  dimTimeout: { labelKey: 'settings.display.dimAfterLabel', descriptionKey: 'settings.display.dimAfterSublabel', unit: 'minutes' },
  screenSaverTimeout: { labelKey: 'settings.display.screenSaverAfterLabel', descriptionKey: 'settings.display.screenSaverAfterSublabel', unit: 'minutes' },
  alwaysOnDisplay: { labelKey: 'settings.display.alwaysOnLabel', descriptionKey: 'settings.display.alwaysOnSublabel' },
  showSeconds: { labelKey: 'settings.display.showSecondsLabel', descriptionKey: 'settings.display.showSecondsSublabel' },
  kioskMode: { labelKey: 'settings.display.kioskModeLabel', descriptionKey: 'settings.display.kioskModeSublabel' },
  kioskRevealGesture: { labelKey: 'settings.display.kioskRevealLabel', descriptionKey: 'settings.display.kioskRevealSublabel' },
  choresEnabled: { labelKey: 'settings.chores.enableLabel', descriptionKey: 'settings.chores.enableSublabel' },
  choresResetTime: { labelKey: 'settings.chores.dailyResetTimeLabel', descriptionKey: 'settings.chores.dailyResetTimeSublabel' },
  streakDays: { labelKey: 'settings.chores.streakDurationLabel', descriptionKey: 'settings.chores.streakDurationSublabel', unit: 'days' },
  currencySymbol: { labelKey: 'settings.chores.currencySymbolLabel', description: 'Symbol shown beside chore rewards.' },
  payoutSchedule: { labelKey: 'settings.chores.payoutScheduleLabel', description: 'How often chore earnings are totaled.' },
};

/**
 * Add-on option → in-app setting, or a label/description when the option
 * is only in beacon/config.yaml (ha_token never appears in the settings screen).
 * The Home Assistant add-on file is beacon/config.yaml.
 */
const ADDON_TO_SETTING = {
  family_name: 'familyName',
  ha_token: {
    label: 'Home Assistant token',
    description: 'Long-lived access token used for browser-side Home Assistant access. Stored as a password.',
  },
  save_config_in_browser: 'saveConfigInBrowser',
  theme: 'themeId',
  auto_dark_mode: 'autoDarkMode',
  weather_entity: 'weatherEntity',
  photo_directory: 'photoDirectory',
  photo_interval: 'photoInterval',
  screen_saver_timeout: 'screenSaverTimeout',
};

const SCHEMA_TYPES = { str: 'string', bool: 'boolean', int: 'integer' };

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function parseFlatBlock(yaml, blockName) {
  const lines = yaml.split('\n');
  let inBlock = false;
  const out = {};
  for (const line of lines) {
    if (!inBlock) {
      if (line === `${blockName}:` || line.startsWith(`${blockName}:`)) inBlock = true;
      continue;
    }
    if (/^\S/.test(line)) break;
    const match = line.match(/^  ([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    out[match[1]] = parseScalar(match[2].trim());
  }
  return out;
}

function parseScalar(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null' || raw === '') return '';
  if (/^-?\d+$/.test(raw)) return Number(raw);
  const quoted = raw.match(/^"(.*)"$/) || raw.match(/^'(.*)'$/);
  if (quoted) return quoted[1];
  return raw;
}

function loadConfigs() {
  const beaconYaml = read('beacon/config.yaml');
  return {
    options: parseFlatBlock(beaconYaml, 'options'),
    schema: parseFlatBlock(beaconYaml, 'schema'),
  };
}

function parseInterface(source) {
  const start = source.indexOf('export interface BeaconSettings {');
  if (start < 0) throw new Error('BeaconSettings interface not found');
  const bodyStart = source.indexOf('{', start) + 1;
  let depth = 1;
  let i = bodyStart;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
    i += 1;
  }
  const body = source.slice(bodyStart, i - 1);
  const props = [];
  let section = 'General';
  let jsdoc = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('//')) {
      section = line.replace(/^\/\/\s*/, '');
      continue;
    }
    if (line.startsWith('/**') || line.startsWith('*')) {
      jsdoc.push(line.replace(/^\/\*\*\s*/, '').replace(/^\*\s?/, '').replace(/\s*\*\/$/, '').trim());
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_]+)\??:\s*([^;]+);\s*(?:\/\/\s*(.*))?$/);
    if (!match) throw new Error(`Unparsed BeaconSettings line: ${line}`);
    props.push({
      section,
      name: match[1],
      type: match[2].trim().replace(/\s+/g, ' '),
      inline: (match[3] ?? '').trim(),
      jsdoc: jsdoc.join(' ').trim(),
    });
    jsdoc = [];
  }
  return props;
}

function extractReturnObject(source) {
  const fn = source.indexOf('function buildDefaults');
  const ret = source.indexOf('return {', fn);
  if (fn < 0 || ret < 0) throw new Error('buildDefaults() return not found');
  const start = source.indexOf('{', ret);
  let depth = 0;
  let inStr = null;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (inStr) {
      if (c === '\\') { i += 1; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, i);
    }
  }
  throw new Error('unterminated buildDefaults return');
}

function parseDefaultProperties(body) {
  const props = [];
  let i = 0;
  const skip = () => {
    while (i < body.length) {
      if (/\s/.test(body[i])) { i += 1; continue; }
      if (body.startsWith('//', i)) {
        while (i < body.length && body[i] !== '\n') i += 1;
        continue;
      }
      if (body.startsWith('/*', i)) {
        const end = body.indexOf('*/', i);
        i = end < 0 ? body.length : end + 2;
        continue;
      }
      break;
    }
  };
  while (i < body.length) {
    skip();
    if (i >= body.length) break;
    const nameMatch = /^([A-Za-z0-9_]+)\s*:/.exec(body.slice(i));
    if (!nameMatch) throw new Error(`expected default property near: ${body.slice(i, i + 40)}`);
    i += nameMatch[0].length;
    skip();
    const exprStart = i;
    let depth = 0;
    let inStr = null;
    while (i < body.length) {
      const c = body[i];
      if (inStr) {
        if (c === '\\') { i += 2; continue; }
        if (c === inStr) inStr = null;
        i += 1;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; i += 1; continue; }
      if (c === '/' && body[i + 1] === '/') {
        while (i < body.length && body[i] !== '\n') i += 1;
        continue;
      }
      if ('{[('.includes(c)) depth += 1;
      else if ('}])'.includes(c)) depth -= 1;
      else if (c === ',' && depth === 0) break;
      i += 1;
    }
    props.push({ name: nameMatch[1], expr: body.slice(exprStart, i).trim() });
    if (body[i] === ',') i += 1;
  }
  return props;
}

function loadFontConstants(source) {
  const out = {};
  for (const name of ['DEFAULT_HEADING_FONT', 'DEFAULT_BODY_FONT']) {
    const match = new RegExp(`export const ${name}[^=]*=\\s*(\\{[\\s\\S]*?\\});`).exec(source);
    if (!match) throw new Error(`missing ${name}`);
    out[name] = JSON.parse(match[1].replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"'));
  }
  return out;
}

function loadEnglish(source) {
  const map = {};
  const re = /'([^']+)':\s*'((?:\\'|[^'])*)'/g;
  for (let match = re.exec(source); match; match = re.exec(source)) {
    map[match[1]] = match[2].replace(/\\'/g, "'");
  }
  return map;
}

function evaluate(expr, options, constants) {
  if (expr === '[]') return [];
  if (expr === '{}') return {};
  if (expr === 'true' || expr === 'false') return expr === 'true';
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
  const quoted = /^'([^']*)'$/.exec(expr) || /^"([^"]*)"$/.exec(expr);
  if (quoted) return quoted[1];
  const fromConfig = /^config\.([A-Za-z0-9_]+)$/.exec(expr);
  if (fromConfig) {
    const key = fromConfig[1];
    if (!(key in options)) throw new Error(`config.${key} is not an add-on option`);
    return { value: options[key], fromConfig: key };
  }
  if (/^[A-Za-z0-9_]+$/.test(expr)) {
    if (!(expr in constants)) throw new Error(`unknown default ${expr}`);
    return constants[expr];
  }
  throw new Error(`cannot read default expression: ${expr}`);
}

function formatDefault(value, unit) {
  const raw = value && typeof value === 'object' && 'fromConfig' in value ? value.value : value;
  let text;
  if (raw && typeof raw === 'object' && raw.kind === 'builtin' && raw.id) text = `builtin: ${raw.id}`;
  else if (typeof raw === 'string') text = raw === '' ? '(empty)' : raw;
  else if (Array.isArray(raw)) text = raw.length === 0 ? '[]' : JSON.stringify(raw);
  else if (raw && typeof raw === 'object') text = Object.keys(raw).length === 0 ? '{}' : JSON.stringify(raw);
  else text = String(raw);
  if (unit && typeof raw === 'number') text = `${text} ${unit}`;
  return text;
}

function cell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function loadTypeAliases(source) {
  const aliases = {};
  const re = /export type ([A-Za-z0-9_]+) = ([^;]+);/g;
  for (let match = re.exec(source); match; match = re.exec(source)) {
    aliases[match[1]] = match[2].replace(/\s+/g, ' ').trim();
  }
  return aliases;
}

function displayType(type, aliases) {
  const resolved = aliases[type] ?? type;
  return resolved.replace(/ \| /g, ' / ');
}

function codeCell(value) {
  return `\`${cell(value).replace(/`/g, "'")}\``;
}

function textOf(meta, en, key) {
  if (meta[key]) return meta[key];
  const localeKey = meta[`${key}Key`];
  if (!localeKey) return '';
  const text = en[localeKey];
  if (!text) throw new Error(`missing English string ${localeKey}`);
  return text;
}

export function buildSettingsReference() {
  const settingsSource = read('src/hooks/useSettings.ts');
  const props = parseInterface(settingsSource);
  const defaults = new Map(
    parseDefaultProperties(extractReturnObject(settingsSource)).map((entry) => [entry.name, entry.expr]),
  );
  const { options, schema } = loadConfigs();
  const constants = loadFontConstants(read('src/fonts/selection.ts'));
  const en = loadEnglish(read('src/i18n/translations/en.ts'));
  const aliases = loadTypeAliases(read('src/types.ts'));

  const names = new Set(props.map((prop) => prop.name));
  for (const key of Object.keys(COPY)) {
    if (!names.has(key)) throw new Error(`COPY entry ${key} is not a BeaconSettings field`);
  }
  for (const prop of props) {
    if (!COPY[prop.name]) throw new Error(`Add a label for new setting ${prop.name} in scripts/settings-reference.mjs`);
    if (!defaults.has(prop.name)) throw new Error(`buildDefaults() is missing ${prop.name}`);
  }

  const rows = props.map((prop) => {
    const meta = COPY[prop.name];
    const evaluated = evaluate(defaults.get(prop.name), options, constants);
    let description = textOf(meta, en, 'description') || prop.jsdoc || prop.inline;
    if (!description) throw new Error(`Add a description for ${prop.name}`);
    const fromConfig = evaluated && typeof evaluated === 'object' && evaluated.fromConfig;
    if (fromConfig) {
      const base = description.replace(/\s+$/, '').replace(/\.$/, '');
      description = `${base}. Uses add-on option \`${fromConfig}\` when Home Assistant provides it.`;
    }
    return {
      ...prop,
      label: textOf(meta, en, 'label'),
      description,
      defaultText: formatDefault(evaluated, meta.unit),
    };
  });

  const sections = [];
  for (const row of rows) {
    let section = sections.find((entry) => entry.name === row.section);
    if (!section) {
      section = { name: row.section, rows: [] };
      sections.push(section);
    }
    section.rows.push(row);
  }

  const addonKeys = Object.keys(options);
  const mapped = Object.keys(ADDON_TO_SETTING);
  for (const key of addonKeys) {
    if (!ADDON_TO_SETTING[key]) throw new Error(`Add-on option ${key} is not in the settings reference map`);
    if (!(key in schema)) throw new Error(`Add-on option ${key} has no schema type`);
  }
  for (const key of mapped) {
    if (!(key in options)) throw new Error(`Mapped add-on option ${key} is not in config.yaml`);
  }

  const byName = new Map(rows.map((row) => [row.name, row]));
  const addonRows = addonKeys.map((key) => {
    const mapped = ADDON_TO_SETTING[key];
    const setting = typeof mapped === 'string' ? byName.get(mapped) : mapped;
    if (!setting) throw new Error(`Add-on option ${key} does not resolve to a setting`);
    const schemaType = schema[key];
    return {
      key,
      type: SCHEMA_TYPES[schemaType] ?? String(schemaType),
      label: setting.label,
      description: setting.description,
      defaultText: formatDefault(options[key]),
    };
  });

  const lines = [
    '---',
    'title: "Settings reference"',
    'description: "Every in-app Beacon setting and Home Assistant add-on option, generated from the source defaults."',
    'order: 5',
    '---',
    '',
    '<!-- Generated by scripts/settings-reference.mjs. Do not edit by hand. -->',
    '',
    '# Settings reference',
    '',
    'Generated from `src/hooks/useSettings.ts`, the English UI strings, and the Home Assistant add-on options in `beacon/config.yaml`. Defaults that read add-on config use the value shipped in that file.',
    '',
    '## In-app settings',
    '',
  ];

  for (const section of sections) {
    lines.push(`### ${section.name}`, '');
    lines.push('| Setting | Label | Type | Default | Description |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const row of section.rows) {
      lines.push(`| ${codeCell(row.name)} | ${cell(row.label)} | ${codeCell(displayType(row.type, aliases))} | ${cell(row.defaultText)} | ${cell(row.description)} |`);
    }
    lines.push('');
  }

  lines.push('## Family member fields', '');
  lines.push('These live on each person under **Settings → Family Members**, not in the tables above. Name, avatar, color, role, PIN, and calendars are described on [Family Members](/docs/features/family/).', '');
  lines.push('| Field | Label | Type | Default | Description |');
  lines.push('| --- | --- | --- | --- | --- |');
  lines.push('| `privilegeEntityId` | Privilege switch | `string` (optional) | (omitted) | Children only, Beacon 1.45.0 and later. A Home Assistant `switch`, `input_boolean`, `light`, or `fan` that turns on when this child finishes today\'s chores. Clearing the picker removes the field. Existing members, settings, and add-on options are left unchanged. See [Chore privileges](/docs/features/chore-privileges/). |');
  lines.push('');

  lines.push('## Add-on options', '');
  lines.push('These are the options in `beacon/config.yaml`, which Home Assistant uses for the add-on. The schema type is the add-on schema.', '');
  lines.push('| Option | Label | Type | Default | Description |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of addonRows) {
    lines.push(`| ${codeCell(row.key)} | ${cell(row.label)} | ${cell(row.type)} | ${cell(row.defaultText)} | ${cell(row.description)} |`);
  }
  lines.push('');
  return `${lines.join('\n')}`;
}

export { OUTPUT };
