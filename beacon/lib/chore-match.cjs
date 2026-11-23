'use strict';

/**
 * Fuzzy match a spoken chore title (and optional family member) to one
 * FamilyStore assignment, then record the completion the same way the
 * wall does: one row in beacon_completions, streak update, the chore
 * events from #88, and a privilege decision for that member.
 */

const {
  dayKey,
  memberProgress,
  privilegeDecision,
  eventsForChoreChange,
} = require('./chore-privileges.cjs');
const { advanceStreak } = require('./chore-day.cjs');

const STOP = new Set(['the', 'a', 'an', 'my', 'our', 'to']);

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function stem(word) {
  if (word.length > 4 && word.endsWith('es') && !word.endsWith('ses')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function tokens(text) {
  return normalize(text).split(' ').filter((word) => word && !STOP.has(word)).map(stem);
}

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function tokenClose(a, b) {
  if (a === b) return true;
  const longer = Math.max(a.length, b.length);
  if (longer < 4) return false;
  const dist = levenshtein(a, b);
  const limit = longer >= 8 ? 2 : 1;
  return dist <= limit && dist < longer;
}

function titleTokens(title) {
  return tokens(title);
}

function titleMatches(query, title) {
  const queryTokens = tokens(query);
  const named = titleTokens(title);
  if (queryTokens.length === 0 || named.length === 0) return false;
  let start = 0;
  for (const wanted of queryTokens) {
    let found = -1;
    for (let i = start; i < named.length; i += 1) {
      if (tokenClose(wanted, named[i])) {
        found = i;
        break;
      }
    }
    if (found < 0) return false;
    start = found + 1;
  }
  return true;
}

function titleEquals(query, title) {
  const queryTokens = tokens(query);
  const named = titleTokens(title);
  if (queryTokens.length === 0 || queryTokens.length !== named.length) return false;
  return queryTokens.every((token, index) => token === named[index]);
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function memberLabel(member) {
  if (member && member.name) return member.name;
  if (member && member.id) return member.id;
  return 'someone';
}

function assignmentPairs(chores, members) {
  const pairs = [];
  for (const chore of Array.isArray(chores) ? chores : []) {
    if (!chore || !chore.id) continue;
    const ids = Array.isArray(chore.assigned_to) ? chore.assigned_to : [];
    if (ids.length === 0) {
      pairs.push({ chore, member: null });
      continue;
    }
    for (const id of ids) {
      const member = (Array.isArray(members) ? members : []).find((entry) => entry && entry.id === id) || {
        id,
        name: id,
      };
      pairs.push({ chore, member });
    }
  }
  return pairs;
}

function matchMembers(members, query) {
  const normalized = normalize(query);
  if (!normalized || normalized === 'i' || normalized === 'we') return [];
  const list = (Array.isArray(members) ? members : []).filter((member) => member && member.name);
  const exact = list.filter((member) => normalize(member.name) === normalized);
  if (exact.length > 0) return exact;
  if (normalized.length < 3) return [];
  return list.filter((member) => normalize(member.name).startsWith(normalized));
}

function choice(pair) {
  return {
    chore_id: pair.chore.id,
    chore_title: pair.chore.name || '',
    member_id: pair.member ? pair.member.id : '',
    member_name: pair.member ? memberLabel(pair.member) : '',
  };
}

function describeChoices(pairs) {
  return pairs.map((pair) => {
    const title = pair.chore.name || pair.chore.id;
    return pair.member ? `${title} (${memberLabel(pair.member)})` : title;
  }).join(', ');
}

/**
 * Resolve a spoken chore to one assignment, or a question.
 * Returns { status: 'one' | 'ambiguous' | 'none', pair, response, choices }.
 */
function matchChore({ chores, members, chore, name }) {
  const query = String(chore || '').trim();
  const memberQuery = String(name || '').trim();
  if (!query) {
    return {
      status: 'none',
      pair: null,
      response: 'Which chore should I mark done?',
      choices: [],
    };
  }

  const allPairs = assignmentPairs(chores, members);
  const loose = allPairs.filter((pair) => titleMatches(query, pair.chore.name || ''));
  const exact = loose.filter((pair) => titleEquals(query, pair.chore.name || ''));
  // "dishes" equals Dishes and is only a word inside "Wash the dishes".
  // Prefer the full-title hit so the shorter name stays unambiguous.
  const titled = exact.length > 0 ? exact : loose;

  let pool = titled;
  if (memberQuery) {
    const people = matchMembers(members, memberQuery);
    if (people.length === 0) {
      return {
        status: 'none',
        pair: null,
        response: `I couldn't find a family member named ${memberQuery}.`,
        choices: [],
      };
    }
    if (people.length > 1) {
      return {
        status: 'ambiguous',
        pair: null,
        response: `Which person? I found ${joinNames(people.map((person) => person.name))}.`,
        choices: [],
      };
    }
    const person = people[0];
    pool = titled.filter((pair) => pair.member && pair.member.id === person.id);
    if (pool.length === 0) {
      return {
        status: 'none',
        pair: null,
        response: `${person.name} doesn't have a chore matching ${query}.`,
        choices: [],
      };
    }
    if (pool.length > 1) {
      return {
        status: 'ambiguous',
        pair: null,
        response: `Which chore for ${person.name}? I found ${describeChoices(pool)}.`,
        choices: pool.map(choice),
      };
    }
  }

  if (pool.length === 0) {
    return {
      status: 'none',
      pair: null,
      response: `I couldn't find a chore called ${query}.`,
      choices: [],
    };
  }

  if (pool.length === 1) {
    if (!pool[0].member) {
      const title = pool[0].chore.name || query;
      return {
        status: 'none',
        pair: null,
        response: `${title} isn't assigned to anyone.`,
        choices: [],
      };
    }
    return { status: 'one', pair: pool[0], response: '', choices: [choice(pool[0])] };
  }

  const choreIds = new Set(pool.map((pair) => pair.chore.id));
  if (choreIds.size === 1 && pool.every((pair) => pair.member)) {
    const title = pool[0].chore.name || query;
    return {
      status: 'ambiguous',
      pair: null,
      response: `${title} is assigned to ${joinNames(pool.map((pair) => memberLabel(pair.member)))}. Who finished it?`,
      choices: pool.map(choice),
    };
  }

  return {
    status: 'ambiguous',
    pair: null,
    response: `Which chore? I found ${describeChoices(pool)}.`,
    choices: pool.map(choice),
  };
}

function doneToday(completions, choreId, memberId, now, timeZone, resetTime) {
  const today = dayKey(now, timeZone || null, resetTime);
  return (Array.isArray(completions) ? completions : []).some((entry) => (
    entry
    && entry.chore_id === choreId
    && entry.member_id === memberId
    && dayKey(entry.completed_at, timeZone || null, resetTime) === today
  ));
}

function bumpStreak(streaks, memberId, now, timeZone, resetTime) {
  const list = Array.isArray(streaks) ? streaks : [];
  const index = list.findIndex((entry) => entry && entry.member_id === memberId);
  const existing = index === -1
    ? { member_id: memberId, current: 0, longest: 0, last_completed: '' }
    : list[index];
  const updated = advanceStreak(existing, now, timeZone || null, resetTime);
  if (updated === existing) return list;
  const next = list.slice();
  if (index === -1) next.push(updated);
  else next[index] = updated;
  return next;
}

/**
 * Apply one matched assignment. Does not write files.
 * `already` completions do not emit events or change privilege state.
 */
function applyChoreCompletion({ members, chores, completions, streaks, pair, now, timeZone, resetTime }) {
  const member = pair.member;
  const chore = pair.chore;
  const title = chore.name || chore.id;
  const who = memberLabel(member);
  const zone = timeZone || null;
  const today = dayKey(now, zone, resetTime);
  if (doneToday(completions, chore.id, member.id, now, zone, resetTime)) {
    return {
      already: true,
      response: `${title} is already done for ${who} today.`,
      completion: null,
      completions: Array.isArray(completions) ? completions : [],
      streaks: Array.isArray(streaks) ? streaks : [],
      events: [],
      decisions: [],
      chore_id: chore.id,
      member_id: member.id,
      member_name: who,
      chore_title: title,
    };
  }

  const before = Array.isArray(completions) ? completions : [];
  const progressBefore = memberProgress(member.id, chores, before, today, zone, resetTime);
  const completion = {
    chore_id: chore.id,
    member_id: member.id,
    completed_at: now.toISOString(),
  };
  const nextCompletions = before.concat(completion);
  const progressAfter = memberProgress(member.id, chores, nextCompletions, today, zone, resetTime);
  const memberRecord = (Array.isArray(members) ? members : []).find((entry) => entry && entry.id === member.id) || member;
  const events = eventsForChoreChange({
    member: memberRecord,
    chore,
    completed: true,
    localDate: today,
    progressBefore,
    progressAfter,
  });
  const decision = privilegeDecision(memberRecord, chores, nextCompletions, today, zone, resetTime);
  return {
    already: false,
    response: `Marked ${title} as done for ${who}.`,
    completion,
    completions: nextCompletions,
    streaks: bumpStreak(streaks, member.id, now, zone, resetTime),
    events,
    decisions: decision ? [decision] : [],
    chore_id: chore.id,
    member_id: member.id,
    member_name: who,
    chore_title: title,
  };
}

/**
 * Match and, when the match is unique, build the FamilyStore write.
 * Callers persist `completions` / `streaks` only when `write` is true.
 */
function planChoreCompletion({ members, chores, completions, streaks, chore, name, now, timeZone, resetTime }) {
  const match = matchChore({ chores, members, chore, name });
  if (match.status !== 'one') {
    return {
      success: false,
      ambiguous: match.status === 'ambiguous',
      response: match.response,
      choices: match.choices,
      write: false,
      already: false,
      events: [],
      decisions: [],
      completions: Array.isArray(completions) ? completions : [],
      streaks: Array.isArray(streaks) ? streaks : [],
    };
  }
  const applied = applyChoreCompletion({
    members,
    chores,
    completions,
    streaks,
    pair: match.pair,
    now,
    timeZone,
    resetTime,
  });
  return {
    success: true,
    ambiguous: false,
    response: applied.response,
    choices: match.choices,
    write: !applied.already,
    already: applied.already,
    events: applied.events,
    decisions: applied.decisions,
    completions: applied.completions,
    streaks: applied.streaks,
    chore_id: applied.chore_id,
    member_id: applied.member_id,
    member_name: applied.member_name,
    chore_title: applied.chore_title,
  };
}

module.exports = {
  normalize,
  tokens,
  titleMatches,
  matchMembers,
  assignmentPairs,
  matchChore,
  applyChoreCompletion,
  planChoreCompletion,
};
