'use strict';

/**
 * GET /beacon-action/chores-left?member=
 *
 * Reads remaining chores from FamilyStore for the household's local day.
 * A chore is left when that assignment has no completion today. "Today"
 * uses Home Assistant's time zone when the server knows it. An optional
 * member name limits the list to one person.
 */

const { dayKey } = require('./chore-privileges.cjs');
const { assignmentPairs, matchMembers } = require('./chore-match.cjs');
const { readList, FILES } = require('./complete-chore.cjs');

function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function doneToday(completions, choreId, memberId, today, timeZone) {
  return (Array.isArray(completions) ? completions : []).some((entry) => (
    entry
    && entry.chore_id === choreId
    && entry.member_id === memberId
    && dayKey(entry.completed_at, timeZone || null) === today
  ));
}

function item(pair) {
  return {
    chore_id: pair.chore.id,
    chore_title: pair.chore.name || '',
    member_id: pair.member ? pair.member.id : '',
    member_name: pair.member ? (pair.member.name || pair.member.id) : '',
  };
}

function householdSpeech(left) {
  if (left.length === 0) return 'All chores are done today.';
  const labels = left.map((pair) => {
    const title = pair.chore.name || pair.chore.id;
    if (!pair.member) return `${title}, unassigned`;
    return `${title} for ${pair.member.name || pair.member.id}`;
  });
  const noun = left.length === 1 ? 'chore' : 'chores';
  return `${left.length} ${noun} left: ${joinNames(labels)}.`;
}

function memberSpeech(person, assigned, left) {
  if (assigned.length === 0) return `${person.name} doesn't have any chores.`;
  if (left.length === 0) return `${person.name} is done with today's chores.`;
  const titles = left.map((pair) => pair.chore.name || pair.chore.id);
  const noun = left.length === 1 ? 'chore' : 'chores';
  return `${person.name} has ${left.length} ${noun} left: ${joinNames(titles)}.`;
}

/**
 * Remaining assignments for the local day.
 * Returns a reply. Does not write.
 */
function listChoresLeft({ members, chores, completions, name, now, timeZone }) {
  const today = dayKey(now || new Date(), timeZone || null);
  const pairs = assignmentPairs(chores, members);
  const memberQuery = String(name || '').trim();
  let pool = pairs;
  let person = null;

  if (memberQuery) {
    const people = matchMembers(members, memberQuery);
    if (people.length === 0) {
      return {
        response: `I couldn't find a family member named ${memberQuery}.`,
        success: false,
        ambiguous: false,
        action: 'chores_left',
        date: today,
        member_name: '',
        left: [],
      };
    }
    if (people.length > 1) {
      return {
        response: `Which person? I found ${joinNames(people.map((entry) => entry.name))}.`,
        success: false,
        ambiguous: true,
        action: 'chores_left',
        date: today,
        member_name: '',
        left: [],
      };
    }
    person = people[0];
    pool = pairs.filter((pair) => pair.member && pair.member.id === person.id);
  }

  const left = pool.filter((pair) => {
    if (!pair.member) return true;
    return !doneToday(completions, pair.chore.id, pair.member.id, today, timeZone);
  });

  if (!person && pairs.length === 0) {
    return {
      response: 'There are no chores on the chart.',
      success: true,
      ambiguous: false,
      action: 'chores_left',
      date: today,
      member_name: '',
      left: [],
    };
  }

  return {
    response: person ? memberSpeech(person, pool, left) : householdSpeech(left),
    success: true,
    ambiguous: false,
    action: 'chores_left',
    date: today,
    member_name: person ? person.name : '',
    left: left.map(item),
  };
}

async function listStoredChores(deps, name) {
  const dataDir = deps.dataDir;
  const now = deps.now ? deps.now() : new Date();
  let timeZone = null;
  if (Object.prototype.hasOwnProperty.call(deps, 'timeZone')) {
    timeZone = deps.timeZone;
  } else if (deps.readTimeZone) {
    try {
      timeZone = await deps.readTimeZone();
    } catch {
      timeZone = null;
    }
  }
  const [members, chores, completions] = await Promise.all([
    readList(dataDir, FILES.members),
    readList(dataDir, FILES.chores),
    readList(dataDir, FILES.completions),
  ]);
  return listChoresLeft({ members, chores, completions, name, now, timeZone });
}

function readBody(req, maxSize = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxSize) {
        req.destroy();
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function memberFromUrl(req) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  return (url.searchParams.get('member') || url.searchParams.get('name') || '').trim();
}

function handleChoresLeft(req, res, deps) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const queryName = memberFromUrl(req);
  const finish = (name) => listStoredChores(deps, name)
    .then((body) => sendJson(res, 200, body))
    .catch((err) => {
      if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message });
    });

  if (req.method === 'GET') {
    finish(queryName);
    return;
  }

  readBody(req).then((raw) => {
    let payload = {};
    if (raw && raw.trim()) {
      try {
        payload = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON' });
        return;
      }
    }
    const fromBody = payload && typeof (payload.member || payload.name) === 'string'
      ? String(payload.member || payload.name).trim()
      : '';
    finish(queryName || fromBody);
  }).catch((err) => {
    if (!res.headersSent) sendJson(res, err.status || 400, { error: err.message });
  });
}

module.exports = {
  listChoresLeft,
  listStoredChores,
  handleChoresLeft,
};
