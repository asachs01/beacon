'use strict';

/**
 * Keyword intent routing for POST /beacon-action/voice.
 * No LLM. Chore phrases are recognized here and completed in FamilyStore
 * by the caller; they are not todo.update_item calls.
 */

function cleanupPhrase(value) {
  return String(value || '')
    .replace(/[.?!,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function listHint(raw) {
  return cleanupPhrase(raw).replace(/\s+list$/i, '').trim();
}

function viewHint(raw) {
  return cleanupPhrase(raw)
    .replace(/\s+(?:view|screen|page|tab)$/i, '')
    .trim()
    .toLowerCase();
}

function choreHint(raw) {
  return cleanupPhrase(raw).replace(/^(?:the|a|an)\s+/i, '').trim();
}

const INTENT_PATTERNS = [
  {
    name: 'add_item',
    patterns: [/^(?:please\s+)?(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:the\s+)?(.+)$/i],
    handler: (m) => ({
      domain: 'todo',
      service: 'add_item',
      data: { item: cleanupPhrase(m[1]) },
      entityHint: listHint(m[2]),
      response: `Added ${cleanupPhrase(m[1])} to ${listHint(m[2])}`,
    }),
  },
  {
    name: 'complete_chore',
    patterns: [
      /^(?!i\b|we\b)([\p{L}][\p{L}'’.-]*)\s+(?:finished|completed|did)\s+(?:the\s+)?(.+?)(?:\s+chore)?$/iu,
    ],
    handler: (m) => ({
      chore: choreHint(m[2]),
      memberName: cleanupPhrase(m[1]),
      response: null,
    }),
  },
  {
    name: 'complete_chore',
    patterns: [
      /^(?:please\s+)?mark\s+(?:the\s+)?(.+?)(?:\s+chore)?\s+as\s+(?:done|complete|completed)$/i,
      /^(?:please\s+)?(?:complete|finish)\s+(?:the\s+)?(.+?)\s+chore$/i,
      /^(?:please\s+)?(?:the\s+)?(.+?)\s+(?:is|are)\s+done$/i,
      /^(?:please\s+)?(?:i\s+|we\s+)?finished\s+(?:the\s+)?(.+?)(?:\s+chore)?$/i,
    ],
    handler: (m) => ({
      chore: choreHint(m[1]),
      memberName: '',
      response: null,
    }),
  },
  {
    name: 'complete_item',
    patterns: [
      /^(?:please\s+)?(?:check off|uncheck)\s+(?:the\s+)?(.+)$/i,
      /^(?:please\s+)?(?:complete|finish)\s+(?:the\s+)?(.+)$/i,
    ],
    handler: (m) => ({
      domain: 'todo',
      service: 'update_item',
      data: { item: cleanupPhrase(m[1]), status: 'completed' },
      entityHint: null,
      response: `Marked ${cleanupPhrase(m[1])} as done`,
    }),
  },
  {
    name: 'play_music',
    patterns: [/^(?:please\s+)?(?:play\s+music|resume\s+music|resume\s+playback|play)$/i],
    handler: () => ({
      domain: 'media_player',
      service: 'media_play',
      data: {},
      entityHint: null,
      response: 'Playing music',
    }),
  },
  {
    name: 'pause_music',
    patterns: [/^(?:please\s+)?(?:pause|stop\s+music|pause\s+music|stop\s+playback)$/i],
    handler: () => ({
      domain: 'media_player',
      service: 'media_pause',
      data: {},
      entityHint: null,
      response: 'Paused music',
    }),
  },
  {
    name: 'next_track',
    patterns: [/^(?:please\s+)?(?:next\s+(?:song|track)|skip)$/i],
    handler: () => ({
      domain: 'media_player',
      service: 'media_next_track',
      data: {},
      entityHint: null,
      response: 'Skipping to next track',
    }),
  },
  {
    name: 'set_volume',
    patterns: [/^(?:please\s+)?(?:set\s+volume\s+(?:to\s+)?(\d+)|volume\s+(\d+))$/i],
    handler: (m) => {
      const level = Math.min(100, Math.max(0, parseInt(m[1] || m[2], 10)));
      return {
        domain: 'media_player',
        service: 'volume_set',
        data: { volume_level: level / 100 },
        entityHint: null,
        response: `Volume set to ${level}%`,
      };
    },
  },
  {
    name: 'calendar',
    patterns: [
      /\bwhat(?:'s| is)\s+on\s+(?:today|my\s+calendar|my\s+schedule|the\s+calendar(?:\s+today)?|the\s+schedule)\b/i,
      /\btoday(?:'s)?\s+(?:schedule|events|calendar|agenda)\b/i,
      /\b(?:what(?:'s| is)\s+happening\s+today|what\s+do\s+we\s+have\s+today|any\s+events\s+today)\b/i,
      /\bshow\s+today(?:'s)?\s+calendar\b/i,
      /\bwhat(?:'s| is)\s+on\s+the\s+calendar\b/i,
    ],
    handler: () => ({
      fetch: 'calendar',
      response: null,
    }),
  },
  {
    name: 'weather',
    patterns: [/\b(?:what(?:'s| is)\s+the\s+weather|weather\s+(?:today|now|forecast))\b/i],
    handler: () => ({
      fetch: 'weather',
      response: null,
    }),
  },
  {
    name: 'navigate',
    patterns: [/^(?:please\s+)?(?:show|go\s+to|open|switch\s+to|navigate\s+to)\s+(?:the\s+)?(.+)$/i],
    handler: (m) => {
      const view = viewHint(m[1]);
      return {
        navigation: true,
        view,
        response: `Navigating to ${view}`,
      };
    },
  },
];

function parseIntent(text) {
  const source = String(text || '').trim();
  if (!source) return null;
  for (const intent of INTENT_PATTERNS) {
    for (const pat of intent.patterns) {
      const match = source.match(pat);
      if (match) {
        return { name: intent.name, ...intent.handler(match) };
      }
    }
  }
  return null;
}

function todoHintMatches(entityId, friendlyName, hint) {
  const wanted = listHint(hint).toLowerCase();
  if (!wanted) return false;
  const name = String(friendlyName || '').toLowerCase().trim();
  const bareName = name.replace(/\s+list$/, '').trim();
  const id = String(entityId || '').toLowerCase();
  const underscored = wanted.replace(/\s+/g, '_');
  const compact = wanted.replace(/\s+/g, '');
  if (name === wanted || bareName === wanted) return true;
  if (name && (name.includes(wanted) || wanted.includes(bareName))) return true;
  if (id === `todo.${underscored}` || id === `todo.${compact}`) return true;
  if (underscored && (id.includes(underscored) || id.includes(compact))) return true;
  return false;
}

function todoHintScore(entityId, friendlyName, hint) {
  const wanted = listHint(hint).toLowerCase();
  const name = String(friendlyName || '').toLowerCase().trim();
  const bareName = name.replace(/\s+list$/, '').trim();
  const id = String(entityId || '').toLowerCase();
  if (name === wanted || bareName === wanted) return 100;
  if (id === `todo.${wanted.replace(/\s+/g, '_')}`) return 90;
  if (name && name.includes(wanted)) return 70;
  if (bareName && wanted.includes(bareName)) return 60;
  return 10;
}

/**
 * Pick a todo entity for an "add X to Y" hint.
 * entities are HA state objects ({ entity_id, attributes }).
 */
function resolveTodoEntity(entities, hint) {
  const todos = (Array.isArray(entities) ? entities : []).filter(
    (entity) => entity && typeof entity.entity_id === 'string' && entity.entity_id.startsWith('todo.'),
  );
  const matches = todos.filter((entity) => todoHintMatches(
    entity.entity_id,
    entity.attributes && entity.attributes.friendly_name,
    hint,
  ));
  matches.sort((a, b) => (
    todoHintScore(b.entity_id, b.attributes && b.attributes.friendly_name, hint)
    - todoHintScore(a.entity_id, a.attributes && a.attributes.friendly_name, hint)
  ));
  return matches[0] ? matches[0].entity_id : null;
}

module.exports = {
  parseIntent,
  listHint,
  viewHint,
  todoHintMatches,
  resolveTodoEntity,
};
