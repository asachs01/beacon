'use strict';

/**
 * Chore-gated privilege decisions and Home Assistant event payloads.
 *
 * Shared by the SPA (via src/api/chore-privileges.ts) and the add-on server.
 * "Today" follows localDayKey — never the UTC calendar date. When the server
 * knows Home Assistant's time_zone it passes that IANA name so a UTC container
 * still buckets completions on the household's local day.
 */

const { localDayKey } = require('./local-day-key.cjs');

const PRIVILEGE_DOMAINS = Object.freeze(['switch', 'input_boolean', 'light', 'fan']);
const CHORE_COMPLETED_EVENT = 'beacon_chore_completed';
const ALL_CHORES_DONE_EVENT = 'beacon_all_chores_done';
const ALLOWED_EVENTS = new Set([CHORE_COMPLETED_EVENT, ALL_CHORES_DONE_EVENT]);
const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayKey(value, timeZone) {
  if (!timeZone) return localDayKey(value);
  if (value === undefined) value = new Date();
  if (typeof value === 'string' && BARE_DATE.test(value.trim())) return value.trim();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
  } catch {
    return localDayKey(value);
  }
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return localDayKey(value);
  return `${year}-${month}-${day}`;
}

function assignedChores(chores, memberId) {
  return (Array.isArray(chores) ? chores : []).filter(
    (chore) => chore && Array.isArray(chore.assigned_to) && chore.assigned_to.includes(memberId),
  );
}

function memberProgress(memberId, chores, completions, localDate, timeZone) {
  const assigned = assignedChores(chores, memberId);
  const done = new Set();
  for (const completion of Array.isArray(completions) ? completions : []) {
    if (!completion || completion.member_id !== memberId) continue;
    if (dayKey(completion.completed_at, timeZone) !== localDate) continue;
    done.add(completion.chore_id);
  }
  let completed = 0;
  for (const chore of assigned) {
    if (done.has(chore.id)) completed += 1;
  }
  return { completed, total: assigned.length };
}

function isMemberDayComplete(progress) {
  return !!progress && progress.total > 0 && progress.completed === progress.total;
}

function privilegeDomain(entityId) {
  if (typeof entityId !== 'string') return null;
  const trimmed = entityId.trim();
  if (!trimmed || !trimmed.includes('.')) return null;
  const domain = trimmed.split('.')[0];
  return PRIVILEGE_DOMAINS.includes(domain) ? domain : null;
}

/**
 * Desired service call for one member.
 * Turn on only when a child with a supported entity has finished every chore
 * assigned to them today. No chores is not "done" — the switch turns off.
 * Parents, a missing entity, and any other domain are left alone.
 */
function privilegeDecision(member, chores, completions, localDate, timeZone) {
  if (!member || member.role !== 'child') return null;
  const entityId = typeof member.privilegeEntityId === 'string' ? member.privilegeEntityId.trim() : '';
  const domain = privilegeDomain(entityId);
  if (!domain) return null;
  const progress = memberProgress(member.id, chores, completions, localDate, timeZone);
  const complete = isMemberDayComplete(progress);
  let reason = 'incomplete';
  if (complete) reason = 'complete';
  else if (progress.total === 0) reason = 'no_chores';
  return {
    memberId: member.id,
    entityId,
    domain,
    service: complete ? 'turn_on' : 'turn_off',
    progress,
    reason,
  };
}

function privilegeDecisions(members, chores, completions, localDate, timeZone) {
  const decisions = [];
  for (const member of Array.isArray(members) ? members : []) {
    const decision = privilegeDecision(member, chores, completions, localDate, timeZone);
    if (decision) decisions.push(decision);
  }
  return decisions;
}

function buildChoreCompletedEvent({ memberId, memberName, choreId, choreTitle, completed, localDate }) {
  return {
    event: CHORE_COMPLETED_EVENT,
    data: {
      member_id: memberId,
      member_name: memberName ?? '',
      chore_id: choreId,
      chore_title: choreTitle ?? '',
      completed: completed === true,
      local_date: localDate,
    },
  };
}

function buildAllChoresDoneEvent({ memberId, memberName, localDate }) {
  return {
    event: ALL_CHORES_DONE_EVENT,
    data: {
      member_id: memberId,
      member_name: memberName ?? '',
      local_date: localDate,
    },
  };
}

/**
 * One beacon_chore_completed on every real toggle. beacon_all_chores_done only
 * when this completion is what makes today's progress complete.
 */
function eventsForChoreChange({ member, chore, completed, localDate, progressBefore, progressAfter }) {
  const events = [
    buildChoreCompletedEvent({
      memberId: member.id,
      memberName: member.name || '',
      choreId: chore && chore.id ? chore.id : '',
      choreTitle: chore && chore.name ? chore.name : '',
      completed: completed === true,
      localDate,
    }),
  ];
  if (
    completed === true
    && isMemberDayComplete(progressAfter)
    && !isMemberDayComplete(progressBefore)
  ) {
    events.push(buildAllChoresDoneEvent({
      memberId: member.id,
      memberName: member.name || '',
      localDate,
    }));
  }
  return events;
}

function acceptedChoreEvents(events) {
  if (!Array.isArray(events)) return [];
  const accepted = [];
  for (const entry of events) {
    if (!entry || typeof entry.event !== 'string' || !ALLOWED_EVENTS.has(entry.event)) continue;
    if (!entry.data || typeof entry.data !== 'object' || Array.isArray(entry.data)) continue;
    accepted.push({ event: entry.event, data: entry.data });
  }
  return accepted;
}

/**
 * Startup and local-midnight privilege sync.
 * Applies once per (time zone, local day). A later time zone discovery uses a
 * new key so the first guess (process zone) is corrected. Failures leave the
 * key unset so the next tick retries. No Supervisor token logs once and does
 * nothing.
 */
function createPrivilegeScheduler(deps) {
  const now = deps.now || (() => new Date());
  const getTimeZone = deps.getTimeZone || (async () => null);
  const readSnapshot = deps.readSnapshot || (async () => ({ members: [], chores: [], completions: [] }));
  const apply = deps.apply || (async () => {});
  const hasToken = deps.hasToken || (() => false);
  const log = deps.log || (() => {});

  let appliedKey = null;
  let warnedNoToken = false;
  let warnedZone = false;
  let running = false;

  return async function tick() {
    if (running) return;
    running = true;
    try {
      if (!hasToken()) {
        if (!warnedNoToken) {
          log('[beacon] privilege sync skipped: no Supervisor token (standalone or dev)');
          warnedNoToken = true;
        }
        return;
      }

      let timeZone = null;
      try {
        timeZone = await getTimeZone();
      } catch (err) {
        timeZone = null;
        if (!warnedZone) {
          log(`[beacon] Home Assistant time zone unavailable (${err.message}). Privilege midnight uses the add-on process timezone, not UTC.`);
          warnedZone = true;
        }
      }
      if (!timeZone && !warnedZone) {
        log('[beacon] Home Assistant time zone unavailable. Privilege midnight uses the add-on process timezone, not UTC.');
        warnedZone = true;
      }

      const today = dayKey(now(), timeZone || null);
      const key = `${timeZone || ''}|${today}`;
      if (appliedKey === key) return;

      const reason = appliedKey === null ? 'startup' : 'local-midnight';
      const snapshot = await readSnapshot();
      const decisions = privilegeDecisions(
        snapshot.members,
        snapshot.chores,
        snapshot.completions,
        today,
        timeZone || null,
      );
      await apply(decisions, { reason, localDate: today, timeZone: timeZone || null });
      appliedKey = key;
    } catch (err) {
      log(`[beacon] privilege sync failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
}

module.exports = {
  PRIVILEGE_DOMAINS,
  CHORE_COMPLETED_EVENT,
  ALL_CHORES_DONE_EVENT,
  dayKey,
  memberProgress,
  isMemberDayComplete,
  privilegeDomain,
  privilegeDecision,
  privilegeDecisions,
  buildChoreCompletedEvent,
  buildAllChoresDoneEvent,
  eventsForChoreChange,
  acceptedChoreEvents,
  createPrivilegeScheduler,
};
