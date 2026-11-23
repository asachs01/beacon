import { describe, expect, it } from 'vitest';
import { parseIntent, resolveTodoEntity } from '../../lib/voice-intents.cjs';

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
    expect(parseIntent('finish the report')).toMatchObject({
      name: 'complete_item',
      data: { item: 'report' },
    });
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
