'use strict';

/**
 * POST /beacon-action/complete-chore
 *
 * Completes a Beacon chore in FamilyStore (the JSON files the wall
 * reads) instead of todo.chores. Fuzzy-matches the title and an
 * optional member name. An ambiguous match returns a question and
 * writes nothing. A unique match appends the completion, updates the
 * streak, fires the same Home Assistant events as a wall toggle, and
 * re-evaluates that member's privilege switch.
 */

const fs = require('fs/promises');
const path = require('path');
const { planChoreCompletion } = require('./chore-match.cjs');

const FILES = {
  members: 'beacon_family_members.json',
  chores: 'beacon_chores.json',
  completions: 'beacon_completions.json',
  streaks: 'beacon_streaks.json',
};

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

async function readList(dataDir, name) {
  try {
    const raw = await fs.readFile(path.join(dataDir, name), 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`${name} is not a list`);
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeList(dataDir, name, list) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, name);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(list), 'utf8');
  await fs.rename(tmp, file);
}

function publicBody(plan) {
  const body = {
    response: plan.response,
    success: plan.success === true,
    ambiguous: plan.ambiguous === true,
    action: 'complete_chore',
    choices: plan.choices || [],
  };
  if (plan.chore_id) body.chore_id = plan.chore_id;
  if (plan.member_id) body.member_id = plan.member_id;
  if (plan.member_name) body.member_name = plan.member_name;
  if (plan.chore_title) body.chore_title = plan.chore_title;
  if (plan.already) body.already = true;
  return body;
}

/**
 * Read FamilyStore, plan the completion, and persist it.
 * Side effects are best-effort: a failed Home Assistant call does not
 * roll back the saved completion.
 */
async function completeStoredChore(deps, input) {
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

  const [members, chores, completions, streaks] = await Promise.all([
    readList(dataDir, FILES.members),
    readList(dataDir, FILES.chores),
    readList(dataDir, FILES.completions),
    readList(dataDir, FILES.streaks),
  ]);

  const plan = planChoreCompletion({
    members,
    chores,
    completions,
    streaks,
    chore: input.chore,
    name: input.name || input.member || '',
    now,
    timeZone,
  });

  if (plan.write) {
    await writeList(dataDir, FILES.completions, plan.completions);
    await writeList(dataDir, FILES.streaks, plan.streaks);
    if (deps.publishEvents) {
      try {
        await deps.publishEvents(plan.events);
      } catch (err) {
        if (deps.log) deps.log(`[beacon] chore events failed: ${err.message}`);
      }
    }
    if (deps.applyPrivileges) {
      try {
        await deps.applyPrivileges(plan.decisions, { reason: 'voice', timeZone });
      } catch (err) {
        if (deps.log) deps.log(`[beacon] privilege sync failed: ${err.message}`);
      }
    }
  }

  return { status: 200, body: publicBody(plan), plan };
}

function handleCompleteChore(req, res, deps) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  readBody(req).then(async (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw || '{}');
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' });
      return;
    }
    const chore = payload && typeof payload.chore === 'string' ? payload.chore.trim() : '';
    const name = payload && typeof (payload.name || payload.member) === 'string'
      ? String(payload.name || payload.member).trim()
      : '';
    if (!chore) {
      sendJson(res, 400, { error: 'Missing "chore"' });
      return;
    }
    try {
      const result = await completeStoredChore(deps, { chore, name });
      sendJson(res, result.status, result.body);
    } catch (err) {
      const status = err.status || 500;
      if (!res.headersSent) sendJson(res, status, { error: err.message });
    }
  }).catch((err) => {
    if (!res.headersSent) sendJson(res, err.status || 400, { error: err.message });
  });
}

module.exports = {
  FILES,
  readList,
  completeStoredChore,
  handleCompleteChore,
};
