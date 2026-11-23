import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseIntent, resolveTodoEntity } from '../../lib/voice-intents.cjs';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '../..');

function voiceYaml(name: 'sentences' | 'intents'): { primary: string; copy: string } {
  const relative = name === 'sentences'
    ? 'custom_sentences/en/beacon.yaml'
    : 'custom_intents/beacon.yaml';
  const direct = join(packageRoot, relative);
  const nested = join(packageRoot, 'beacon', relative);
  const parent = join(packageRoot, '..', relative);
  if (existsSync(direct) && existsSync(nested)) {
    return { primary: readFileSync(nested, 'utf8'), copy: readFileSync(direct, 'utf8') };
  }
  if (existsSync(direct) && existsSync(parent)) {
    return { primary: readFileSync(direct, 'utf8'), copy: readFileSync(parent, 'utf8') };
  }
  throw new Error(`Could not find both copies of ${relative}`);
}

function extractSentences(yaml: string): Record<string, string[]> {
  const intents: Record<string, string[]> = {};
  let current: string | null = null;
  let inSentences = false;
  for (const line of yaml.split('\n')) {
    const intent = line.match(/^ {2}([A-Za-z][A-Za-z0-9_]*):\s*$/);
    if (intent) {
      current = intent[1];
      intents[current] = [];
      inSentences = false;
      continue;
    }
    if (/^\s+- sentences:\s*$/.test(line)) {
      inSentences = true;
      continue;
    }
    if (!inSentences || !current) continue;
    const sentence = line.match(/^\s+- "(.+)"\s*$/);
    if (sentence) {
      intents[current].push(sentence[1]);
      continue;
    }
    if (/^\s+[A-Za-z0-9_]+:/.test(line)) inSentences = false;
  }
  return intents;
}

function intentBlocks(yaml: string): Record<string, string> {
  const blocks: Record<string, string> = {};
  let name = '';
  let lines: string[] = [];
  const flush = () => {
    if (name) blocks[name] = lines.join('\n');
  };
  for (const line of yaml.split('\n')) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_]*):/);
    if (match) {
      flush();
      name = match[1];
      lines = [line];
    } else if (name) {
      lines.push(line);
    }
  }
  flush();
  return blocks;
}

function expandOptionals(sentence: string): string[] {
  const match = /\[([^[\]]+)\]/.exec(sentence);
  if (!match || match.index === undefined) {
    return [sentence.replace(/\s+/g, ' ').trim()];
  }
  const before = sentence.slice(0, match.index);
  const after = sentence.slice(match.index + match[0].length);
  return [
    ...expandOptionals(`${before}${match[1]}${after}`),
    ...expandOptionals(`${before}${after}`),
  ].map((value) => value.replace(/\s+/g, ' ').trim());
}

const SLOT_SAMPLES: Record<string, string> = {
  item: 'milk',
  list_name: 'grocery',
  chore: 'dishes',
  name: 'Alex',
  view: 'calendar',
  duration: '5 minutes',
};

function concretePhrases(sentence: string): string[] {
  return expandOptionals(sentence).map((expanded) => expanded.replace(
    /\{([A-Za-z0-9_]+)\}/g,
    (_match, slot: string) => {
      const sample = SLOT_SAMPLES[slot];
      if (!sample) throw new Error(`No sample value for slot {${slot}}`);
      return sample;
    },
  ));
}

const WALL_INTENT: Record<string, string> = {
  BeaconAddItem: 'add_item',
  BeaconCheckOffItem: 'complete_item',
  BeaconUncheckItem: 'uncheck_item',
  BeaconCompleteChore: 'complete_chore',
  BeaconCompleteChoreByPerson: 'complete_chore',
  BeaconCalendarToday: 'calendar',
  BeaconShowView: 'navigate',
  BeaconChoreStatus: 'chores_left',
  BeaconChoreStatusByPerson: 'chores_left',
};

describe('parseIntent routing', () => {
  it('routes chore phrases to complete_chore, including a person', () => {
    expect(parseIntent('mark dishes as done')).toMatchObject({
      name: 'complete_chore',
      chore: 'dishes',
      memberName: '',
    });
    expect(parseIntent('complete the dishes chore')).toMatchObject({
      name: 'complete_chore',
      chore: 'dishes',
    });
    expect(parseIntent('I finished vacuuming')).toMatchObject({
      name: 'complete_chore',
      chore: 'vacuuming',
      memberName: '',
    });
    expect(parseIntent('the dishes are done')).toMatchObject({
      name: 'complete_chore',
      chore: 'dishes',
    });
    expect(parseIntent('Alex finished vacuuming')).toMatchObject({
      name: 'complete_chore',
      chore: 'vacuuming',
      memberName: 'Alex',
    });
    expect(parseIntent('Sam did the laundry chore')).toMatchObject({
      name: 'complete_chore',
      chore: 'laundry',
      memberName: 'Sam',
    });
  });

  it('keeps grocery adds on the todo list path', () => {
    expect(parseIntent('add milk to the grocery list')).toMatchObject({
      name: 'add_item',
      domain: 'todo',
      service: 'add_item',
      data: { item: 'milk' },
      entityHint: 'grocery',
    });
    expect(parseIntent('put eggs on the shopping list')).toMatchObject({
      name: 'add_item',
      data: { item: 'eggs' },
      entityHint: 'shopping',
    });
  });

  it('reads remaining chores from the family chart, not a todo list', () => {
    expect(parseIntent('what chores are left')).toMatchObject({
      name: 'chores_left',
      memberName: '',
    });
    expect(parseIntent('any chores left')).toMatchObject({ name: 'chores_left', memberName: '' });
    expect(parseIntent('what needs to be done')).toMatchObject({ name: 'chores_left' });
    expect(parseIntent('show the chore list')).toMatchObject({ name: 'chores_left', memberName: '' });
    expect(parseIntent('what chores does Ada have left')).toMatchObject({
      name: 'chores_left',
      memberName: 'Ada',
    });
    expect(parseIntent("what's left for Bo")).toMatchObject({
      name: 'chores_left',
      memberName: 'Bo',
    });
    expect(parseIntent('show the chores')).toMatchObject({ name: 'navigate', view: 'chores' });
  });

  it('reads today from calendar phrases', () => {
    expect(parseIntent("what's on the calendar today")).toMatchObject({ name: 'calendar', fetch: 'calendar' });
    expect(parseIntent('what is on the calendar')).toMatchObject({ name: 'calendar' });
    expect(parseIntent('any events today')).toMatchObject({ name: 'calendar' });
    expect(parseIntent("show today's calendar")).toMatchObject({ name: 'calendar' });
  });

  it('leaves check-off and bare complete as todo items', () => {
    expect(parseIntent('check off milk')).toMatchObject({
      name: 'complete_item',
      domain: 'todo',
      service: 'update_item',
      data: { item: 'milk', status: 'completed' },
    });
    expect(parseIntent('please check off the milk')).toMatchObject({
      name: 'complete_item',
      data: { item: 'milk', status: 'completed' },
      response: 'Marked milk as done',
    });
    expect(parseIntent('finish the report')).toMatchObject({
      name: 'complete_item',
      data: { item: 'report' },
    });
    expect(parseIntent('uncheck milk')).toMatchObject({
      name: 'uncheck_item',
      domain: 'todo',
      service: 'update_item',
      data: { item: 'milk', status: 'needs_action' },
      response: 'Unchecked milk',
    });
    expect(parseIntent('please uncheck the milk.')).toMatchObject({
      name: 'uncheck_item',
      data: { item: 'milk', status: 'needs_action' },
    });
    expect(parseIntent('mark dishes as done')?.name).toBe('complete_chore');
    expect(parseIntent('complete the dishes chore')?.name).toBe('complete_chore');
  });

  it('still routes navigation, music, and unknown text', () => {
    expect(parseIntent('show the calendar')).toMatchObject({
      name: 'navigate',
      navigation: true,
      view: 'calendar',
    });
    expect(parseIntent('switch to the grocery view')).toMatchObject({
      name: 'navigate',
      view: 'grocery',
    });
    expect(parseIntent('play music')).toMatchObject({ name: 'play_music', service: 'media_play' });
    expect(parseIntent('set volume to 40')).toMatchObject({
      name: 'set_volume',
      data: { volume_level: 0.4 },
    });
    expect(parseIntent('what is the weather')).toMatchObject({ name: 'weather', fetch: 'weather' });
    expect(parseIntent('hello there')).toBeNull();
  });
});

describe('Assist sentences match the wall parser', () => {
  const sentenceFiles = voiceYaml('sentences');
  const intentFiles = voiceYaml('intents');
  const sentences = extractSentences(sentenceFiles.primary);

  it('keeps the sentence and intent files identical at the repo root and under beacon/', () => {
    expect(sentenceFiles.copy).toBe(sentenceFiles.primary);
    expect(intentFiles.copy).toBe(intentFiles.primary);
  });

  it('keeps Beacon chore phrases unchanged', () => {
    expect(sentences.BeaconCompleteChore).toEqual([
      'mark {chore} as done',
      'mark {chore} as complete',
      'complete [the] {chore} chore',
      '{chore} is done',
      'I finished {chore}',
      'finished {chore}',
    ]);
    expect(sentences.BeaconCompleteChoreByPerson).toEqual([
      '{name} finished {chore}',
      '{name} completed {chore}',
      '{name} did {chore}',
      '{name} did [the] {chore} chore',
    ]);
    const choreText = [
      ...sentences.BeaconCompleteChore,
      ...sentences.BeaconCompleteChoreByPerson,
    ].join('\n');
    expect(choreText).not.toMatch(/check off|uncheck/i);
  });

  it('covers check off and uncheck with the same todo outcome as the wall', () => {
    expect(sentences.BeaconCheckOffItem).toEqual(['[please] check off [the] {item}']);
    expect(sentences.BeaconUncheckItem).toEqual(['[please] uncheck [the] {item}']);

    for (const phrase of concretePhrases(sentences.BeaconCheckOffItem[0])) {
      expect(parseIntent(phrase), phrase).toMatchObject({
        name: 'complete_item',
        service: 'update_item',
        data: { item: 'milk', status: 'completed' },
      });
    }
    for (const phrase of concretePhrases(sentences.BeaconUncheckItem[0])) {
      expect(parseIntent(phrase), phrase).toMatchObject({
        name: 'uncheck_item',
        service: 'update_item',
        data: { item: 'milk', status: 'needs_action' },
      });
    }

    const blocks = intentBlocks(intentFiles.primary);
    expect(blocks.BeaconCheckOffItem).toContain('service: todo.update_item');
    expect(blocks.BeaconCheckOffItem).toMatch(/status: completed\b/);
    expect(blocks.BeaconUncheckItem).toContain('service: todo.update_item');
    expect(blocks.BeaconUncheckItem).toMatch(/status: needs_action\b/);
    expect(blocks.BeaconCompleteChore).toContain('rest_command.beacon_complete_chore');
    expect(blocks.BeaconCompleteChore).not.toMatch(/check off|uncheck/i);
    expect(blocks.BeaconCompleteChoreByPerson).not.toMatch(/check off|uncheck/i);
  });

  it('parses shared Assist sentences the same way as the wall', () => {
    for (const [intent, expected] of Object.entries(WALL_INTENT)) {
      expect(sentences[intent]?.length, intent).toBeGreaterThan(0);
      for (const template of sentences[intent]) {
        for (const phrase of concretePhrases(template)) {
          expect(parseIntent(phrase)?.name, `${intent}: ${phrase}`).toBe(expected);
        }
      }
    }
    for (const assistOnly of ['BeaconCalendarTomorrow', 'BeaconSetTimer', 'BeaconGroceryList']) {
      expect(sentences[assistOnly]?.length, assistOnly).toBeGreaterThan(0);
    }
  });
});

describe('resolveTodoEntity', () => {
  const entities = [
    { entity_id: 'todo.grocery', attributes: { friendly_name: 'Grocery' } },
    { entity_id: 'todo.tasks', attributes: { friendly_name: 'Tasks' } },
  ];

  it('matches a grocery hint after stripping the word list', () => {
    expect(resolveTodoEntity(entities, 'grocery list')).toBe('todo.grocery');
    expect(resolveTodoEntity(entities, 'shopping')).toBeNull();
  });
});
