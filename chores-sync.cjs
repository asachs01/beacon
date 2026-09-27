'use strict';

/**
 * Two-way sync between Family's chores and Google Tasks, one list per family
 * member (accessed through HA's `todo` integration — Family never talks to
 * Google's API directly).
 *
 * Runs in the add-on server (server.js), one pass at a time: on a timer, a
 * few seconds after a chore or completion changes, and on demand from the
 * Settings "Sync Now" button. It used to run in every open browser, which
 * stopped when no screen was open, re-polled Google once per open device per
 * minute, and let passes on different devices overlap — a task newly added
 * in Google Tasks could be imported as two chores.
 *
 * CHORES: each family member who has a list configured gets their own synced
 * copy of every chore assigned to them, as a task in THEIR list. A chore
 * assigned to two people (each with their own list) creates one task in each
 * person's list, completable independently — that's what preserves Family's
 * per-person completion tracking through a sync to a system that has no
 * concept of multiple assignees.
 *
 * ROUTINES are not synced. Google Tasks subtasks aren't visible through HA's
 * todo integration, and one task per routine step cluttered the lists.
 * Routine tasks created by earlier versions (tracked in
 * beacon_routine_sync_links) are removed from Google Tasks on the next pass.
 *
 * Chores reset automatically with no special "daily reset" logic: Family's
 * completion tracking is date-scoped (completions made today, in Home
 * Assistant's time zone), so once a new day starts a chore is "not completed"
 * on Family's side — the next pass compares that against what was last
 * pushed to the task and un-checks it, the same as any other change.
 *
 * New tasks added directly in someone's Google Tasks app are imported as
 * chores assigned to that member.
 *
 * Tasks carry nothing in their notes: they're matched by uid through the
 * link records below. If a link is lost, an unlinked task with the chore's
 * title in that member's list is adopted rather than imported as a new
 * chore. Earlier builds wrote a "[beacon-sync] chore_id:…" tag into each
 * task's notes; it's still recognized, and stripped on the next pass.
 *
 * Sync link records (beacon_chores_sync_links) track which task (by uid,
 * within that member's list) corresponds to which chore, plus the status
 * Family and the task last agreed on — that's what lets a pass tell a
 * genuine change apart from one it already applied.
 */

const COLLECTIONS = {
  members: 'beacon_family_members',
  chores: 'beacon_chores',
  completions: 'beacon_completions',
  streaks: 'beacon_streaks',
  links: 'beacon_chores_sync_links',
  /** Left by versions that also synced routine tasks; only read for cleanup. */
  legacyRoutineLinks: 'beacon_routine_sync_links',
};

/** Tag earlier builds wrote into task notes; no longer written. */
const LEGACY_MARKER_PREFIX = '[beacon-sync]';

/**
 * The day before a "YYYY-MM-DD" key, by the calendar. Now minus 24 hours
 * isn't always yesterday: after a 23-hour daylight-saving day, at 00:30
 * it's the day before yesterday, and a streak restarted at 1.
 */
function previousDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** The first day ("YYYY-MM-DD") of the week holding `key`; weeks start on Sunday (0) or Monday (1). */
function weekStartKey(key, weekStartsOn) {
  const [y, m, d] = key.split('-').map(Number);
  const back = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() - weekStartsOn + 7) % 7;
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}

/** A chore's name from its Google task title: the title minus the chore's icon prefix. */
function choreNameFromTitle(title, chore) {
  const prefix = chore.icon ? `${chore.icon} ` : '';
  return prefix && title.startsWith(prefix) ? title.slice(prefix.length) : title;
}

/**
 * Links are looked up by the chore and member they belong to. Their `id` is
 * assigned by the server when the record is added, so it can't be used as
 * this key — doing so meant no link was ever found: every pass re-linked
 * each chore and then deleted its Google task as orphaned.
 */
function choreLinkKey(link) {
  return `${link.chore_id}:${link.member_id}`;
}

/** Matches FamilyStore's stable completion id for the current chore round. */
function choreCompletionId(chore, memberId, today, weekStart) {
  const roundKey = chore.frequency === 'once'
    ? 'once'
    : chore.frequency === 'weekly'
      ? weekStart
      : today;
  return `chore-${encodeURIComponent(chore.id)}:${encodeURIComponent(memberId)}:${roundKey}`;
}

function formatChoreTitle(chore) {
  const icon = chore.icon ? `${chore.icon} ` : '';
  return `${icon}${chore.name}`;
}

function legacyChoreMarker(choreId, memberId) {
  return `${LEGACY_MARKER_PREFIX} chore_id:${choreId} member_id:${memberId}`;
}

/** Notes with the legacy tag line removed; null when nothing else is left. */
function stripLegacyMarker(description) {
  const kept = description
    .split('\n')
    .filter((line) => !line.includes(LEGACY_MARKER_PREFIX))
    .join('\n')
    .trim();
  return kept || null;
}

/**
 * An unlinked task in this list that belongs to the chore: one tagged for it
 * by an earlier build, else one with the chore's title.
 */
function findUnlinkedTask(items, known, chore, memberId) {
  const unlinked = items.filter((it) => it.uid && !known.has(it.uid));
  const marker = legacyChoreMarker(chore.id, memberId);
  return unlinked.find((it) => it.description?.includes(marker))
    ?? unlinked.find((it) => it.summary === formatChoreTitle(chore));
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Returns a function giving the "YYYY-MM-DD" day a timestamp falls on in
 * `timeZone` (an IANA name such as "Pacific/Auckland"; undefined or an
 * unknown name means the server's own zone). Missing or unparseable values
 * give "", like the app's localDayKey.
 */
function dayKeyFormatter(timeZone) {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
  let format;
  try {
    format = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
  } catch {
    format = new Intl.DateTimeFormat('en-US', options);
  }
  return (value) => {
    if (value === undefined || value === null || value === '') return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = {};
    for (const part of format.formatToParts(date)) parts[part.type] = part.value;
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
}

/** The settings that decide what a pass does, as a comparable string. */
function syncConfigKey(settings) {
  const lists = settings?.choresSyncListByMember;
  const entries = lists && typeof lists === 'object'
    ? Object.entries(lists).filter(([, entityId]) => entityId).sort()
    : [];
  return JSON.stringify([settings?.choresSyncEnabled === true, entries]);
}

/**
 * @param deps.store         Collection access with the add-on's locking:
 *                           list(name) (throws if the file can't be read),
 *                           add(name, item), update(name, id, patch),
 *                           remove(name, id).
 * @param deps.callService   (domain, service, data, { returnResponse, reason })
 *                           → HA's response body; throws on an HA error.
 * @param deps.readSettings  () → the app settings object, or null.
 * @param deps.getTimeZone   () → Home Assistant's time zone name.
 * @param deps.haAvailable   () → whether HA can be reached at all.
 * @param deps.log           (line) → writes a line to the add-on log.
 * @param deps.now           () → the current time (a Date).
 */
function createChoresSync({
  store,
  callService,
  readSettings,
  getTimeZone = async () => undefined,
  haAvailable = () => true,
  log = () => {},
  now = () => new Date(),
  intervalMs = 60_000,
  soonDelayMs = 5_000,
}) {
  let queue = Promise.resolve();
  let activePasses = 0;
  let timer = null;
  let timerDueAt = 0;
  let started = false;
  let lastConfigKey = null;
  /** Warnings from the previous pass: logged again only once they change. */
  let previousWarnings = new Set();
  const state = {
    /** When the last pass that ran (not skipped) finished without failing. */
    lastSyncedAt: null,
    /** Why the last pass failed; cleared by the next successful one. */
    lastError: null,
    /** When a pass last changed Family's chores or completions. */
    lastChangeAt: null,
    /** Plain-language problems from the last successful pass. */
    problems: [],
  };

  /** Refresh-before-read: see syncOnce. Failure isn't fatal. */
  async function refreshList(entityId, warn) {
    await callService('homeassistant', 'update_entity', { entity_id: entityId }).catch((err) => {
      warn(`${entityId}: couldn't refresh from Google, using HA's cached copy (${errorMessage(err)})`);
    });
  }

  /** Items of a to-do list. Throws when the list can't be read. */
  async function fetchTodoItems(entityId) {
    const response = await callService(
      'todo', 'get_items',
      { entity_id: entityId, status: ['needs_action', 'completed'] },
      { returnResponse: true },
    );
    // HA answers { service_response: { [entityId]: { items } } }; the
    // unwrapped { [entityId]: { items } } form is accepted too.
    const byEntity = response && typeof response === 'object' && 'service_response' in response
      ? response.service_response
      : response;
    const items = byEntity?.[entityId]?.items;
    if (!Array.isArray(items)) throw new Error('unreadable response');
    return items;
  }

  async function syncOnce({ note, change, warn, problem }) {
    const settings = (await readSettings()) || {};
    lastConfigKey = syncConfigKey(settings);
    const enabled = settings.choresSyncEnabled === true;
    const listByMember = settings.choresSyncListByMember && typeof settings.choresSyncListByMember === 'object'
      ? settings.choresSyncListByMember
      : {};
    const members = await store.list(COLLECTIONS.members);
    const memberName = (id) => members.find((m) => m.id === id)?.name ?? id;
    const activeMembers = members.filter((m) => listByMember[m.id]);
    if (!enabled || activeMembers.length === 0 || !haAvailable()) {
      note(`skipped: enabled=${enabled} membersWithLists=${activeMembers.length} haAccess=${haAvailable()}`);
      return { outcome: 'skipped', changed: false };
    }

    const timeZone = await getTimeZone();
    const dayKey = dayKeyFormatter(timeZone);
    const today = dayKey(now());

    // Read everything fresh every pass: every link whose chore is missing
    // is removed from Google Tasks as "deleted in Family", so a list that
    // can't be read must fail the pass (store.list throws), never count as
    // empty.
    const [links, legacyRoutineLinks, chores, completions] = await Promise.all([
      store.list(COLLECTIONS.links),
      store.list(COLLECTIONS.legacyRoutineLinks),
      store.list(COLLECTIONS.chores),
      store.list(COLLECTIONS.completions),
    ]);
    // A chore's current round, as in the app (src/api/chore-rounds.ts): a
    // daily chore is done for the day, a weekly one for the week, a one-off
    // for good. (Every chore counted as daily, so finished one-off tasks
    // were un-ticked in Google the next day.)
    const weekStart = weekStartKey(today, settings.weekStartsOn === 1 ? 1 : 0);
    const inCurrentRound = (completion, chore) => {
      if (chore.frequency === 'once') return true;
      const day = dayKey(completion.completed_at);
      return chore.frequency === 'weekly' ? day >= weekStart : day === today;
    };
    const choreById = new Map(chores.map((c) => [c.id, c]));
    const currentCompletions = completions.filter((c) => choreById.has(c.chore_id) && inCurrentRound(c, choreById.get(c.chore_id)));
    note(`time zone: ${timeZone || 'server default'}, today=${today}, week from ${weekStart}`);
    note(`lists: ${activeMembers.map((m) => `${m.name} -> ${listByMember[m.id]}`).join(', ')}`);
    note(`chores=${chores.length} links=${links.length} currentCompletions=${currentCompletions.length}`);

    // --- Family-side writes, matching FamilyStore in src/api/family.ts ---

    // These re-read the completions rather than use the copy read at the
    // start of the pass: a tick made in Family while the pass runs must be
    // seen, or the chore would be completed (and paid) twice.
    const completeChore = async (chore, memberId) => {
      const all = await store.list(COLLECTIONS.completions);
      const done = all.some((c) => c.chore_id === chore.id && c.member_id === memberId && inCurrentRound(c, chore));
      if (done) return;
      await store.add(COLLECTIONS.completions, {
        id: choreCompletionId(chore, memberId, today, weekStart),
        chore_id: chore.id,
        member_id: memberId,
        completed_at: now().toISOString(),
      });
      await advanceStreak(memberId);
    };

    const uncompleteChore = async (chore, memberId) => {
      const all = await store.list(COLLECTIONS.completions);
      const match = all.find((c) => c.chore_id === chore.id && c.member_id === memberId && inCurrentRound(c, chore));
      if (match?.id) await store.remove(COLLECTIONS.completions, match.id);
    };

    // Matches FamilyStore.updateStreakForMember, so a chore ticked in Google
    // counts exactly like one ticked in Family: a member with no streak
    // record has never completed anything, and their first completion
    // creates one, stored under their member id.
    const advanceStreak = async (memberId) => {
      const streaks = await store.list(COLLECTIONS.streaks);
      const existing = streaks.find((s) => s.member_id === memberId);
      const lastDate = dayKey(existing?.last_completed);
      if (lastDate === today) return;
      const yesterday = previousDayKey(today);
      const current = lastDate === yesterday ? (existing?.current ?? 0) + 1 : 1;
      const patch = {
        member_id: memberId,
        current,
        longest: Math.max(existing?.longest ?? 0, current),
        last_completed: now().toISOString(),
      };
      if (existing) await store.update(COLLECTIONS.streaks, memberId, patch);
      else await store.add(COLLECTIONS.streaks, { ...patch, id: memberId });
    };

    // --- Read every list, refreshing it from Google first ---
    // Google Tasks' coordinator only polls every 30 minutes, and get_items
    // answers from that cache — so without the refresh, a task checked off
    // in the Google Tasks app stays "needs_action" here for up to 30 min.

    // Every list at once: they're independent, and a refresh can take
    // seconds each (up to a minute when Google is slow).
    const itemsByEntity = new Map();
    const entityIds = [...new Set(activeMembers.map((m) => listByMember[m.id]))];
    await Promise.all(entityIds.map(async (entityId) => {
      await refreshList(entityId, warn);
      try {
        const items = await fetchTodoItems(entityId);
        itemsByEntity.set(entityId, items);
        note(`${entityId}: ${items.length} tasks, ${items.filter((it) => it.status === 'completed').length} completed`);
      } catch (err) {
        // Unreadable list: leave it out entirely, so nothing below
        // mistakes its tasks for deleted ones this pass.
        warn(`${entityId}: couldn't read the list, skipped it this pass (${errorMessage(err)})`);
        for (const m of activeMembers.filter((am) => listByMember[am.id] === entityId)) problem(`Couldn't read ${m.name}'s list`);
      }
    }));

    // Remove routine tasks created before routines stopped syncing, and
    // drop them from this pass's item lists so they aren't imported. As
    // with chore links, a link goes only once its task is gone: dropped
    // after a failed delete, the task came back as a new chore.
    for (const link of legacyRoutineLinks) {
      const entityId = listByMember[link.member_id];
      if (entityId) {
        const items = itemsByEntity.get(entityId);
        if (!items) continue; // list unreadable: next pass
        itemsByEntity.set(entityId, items.filter((it) => it.uid !== link.uid));
        if (items.some((it) => it.uid === link.uid)) {
          change(`removing old routine task ${link.uid} from ${entityId}`);
          try {
            await callService('todo', 'remove_item', { entity_id: entityId, item: link.uid }, { reason: `chores-sync: legacy routine link ${link.id}` });
          } catch (err) {
            warn(`couldn't remove old routine task ${link.uid}, will try again: ${errorMessage(err)}`);
            continue;
          }
        }
      }
      await store.remove(COLLECTIONS.legacyRoutineLinks, link.id);
    }
    // Routine tasks whose link was already lost are still recognizable by
    // their description marker.
    for (const [entityId, items] of itemsByEntity) {
      const orphans = items.filter((it) => it.uid && it.description?.includes(`${LEGACY_MARKER_PREFIX} routine_id:`));
      for (const it of orphans) {
        change(`removing old routine task "${it.summary}" from ${entityId}`);
        await callService('todo', 'remove_item', { entity_id: entityId, item: it.uid }, { reason: 'chores-sync: orphaned routine task' }).catch(() => {});
      }
      if (orphans.length) itemsByEntity.set(entityId, items.filter((it) => !orphans.includes(it)));
    }

    const knownUidsByList = new Map();
    const knownUids = (entityId) => {
      if (!knownUidsByList.has(entityId)) knownUidsByList.set(entityId, new Set());
      return knownUidsByList.get(entityId);
    };
    for (const l of links) {
      const entityId = listByMember[l.member_id];
      if (entityId) knownUids(entityId).add(l.uid);
    }

    // One link per (chore, member). Earlier builds could save several; keep
    // the one whose task still exists and drop the rest, deleting any extra
    // Google tasks they point at (Family-created duplicates).
    const linksByKey = new Map();
    const extraLinks = [];
    for (const l of links) {
      const key = choreLinkKey(l);
      const current = linksByKey.get(key);
      if (!current) { linksByKey.set(key, l); continue; }
      const items = itemsByEntity.get(listByMember[l.member_id]);
      const exists = (link) => !!items?.some((it) => it.uid === link.uid);
      if (!exists(current) && exists(l)) {
        extraLinks.push(current);
        linksByKey.set(key, l);
      } else {
        extraLinks.push(l);
      }
    }
    // A link goes only once its Google task is gone: dropped any sooner, a
    // task that's still there is imported as a new chore on the next pass.
    let extraLinksRemoved = 0;
    for (const extra of extraLinks) {
      const kept = linksByKey.get(choreLinkKey(extra));
      const entityId = listByMember[extra.member_id];
      if (entityId && extra.uid !== kept.uid) {
        const items = itemsByEntity.get(entityId);
        if (!items) continue; // list unreadable: next pass
        if (items.some((it) => it.uid === extra.uid)) {
          change(`duplicate link for ${choreLinkKey(extra)}: deleting extra Google task ${extra.uid}`);
          try {
            await callService('todo', 'remove_item', { entity_id: entityId, item: extra.uid }, { reason: `chores-sync: duplicate task for ${choreLinkKey(extra)}` });
          } catch (err) {
            warn(`couldn't delete duplicate Google task ${extra.uid}, will try again: ${errorMessage(err)}`);
            continue;
          }
          itemsByEntity.set(entityId, items.filter((it) => it.uid !== extra.uid));
        }
      }
      await store.remove(COLLECTIONS.links, extra.id);
      extraLinksRemoved++;
    }
    if (extraLinksRemoved) change(`removed ${extraLinksRemoved} duplicate link record(s)`);

    let choresChanged = false;

    // Titles of chores with no link yet, per list: an unlinked task with
    // one of these titles is adopted by the reconcile step below, not
    // imported as a new chore.
    const unlinkedTitles = new Map();
    for (const chore of chores) {
      for (const memberId of chore.assigned_to ?? []) {
        const entityId = listByMember[memberId];
        if (!entityId || linksByKey.has(`${chore.id}:${memberId}`)) continue;
        if (!unlinkedTitles.has(entityId)) unlinkedTitles.set(entityId, new Set());
        unlinkedTitles.get(entityId).add(formatChoreTitle(chore));
      }
    }

    // --- Pull: tasks with no known link were added directly in that
    // member's Google Tasks app. Import as a chore assigned to them, unless
    // it's already done: Google Tasks keeps finished tasks, and turning the
    // sync on imported every one a member had ever finished as a finished
    // one-off chore. ---
    for (const member of activeMembers) {
      const entityId = listByMember[member.id];
      const items = itemsByEntity.get(entityId) ?? [];
      const known = knownUids(entityId);

      for (const item of items) {
        if (!item.uid || known.has(item.uid)) continue;
        // Family's own task whose link was lost: adopted below.
        if (item.description?.includes(LEGACY_MARKER_PREFIX)) continue;
        if (unlinkedTitles.get(entityId)?.has(item.summary)) continue;
        if (item.status === 'completed') continue;

        const newChore = await store.add(COLLECTIONS.chores, {
          name: item.summary,
          assigned_to: [member.id],
          frequency: 'once',
          value_cents: 0,
        });
        await store.add(COLLECTIONS.links, {
          chore_id: newChore.id,
          member_id: member.id,
          uid: item.uid,
          last_synced_status: item.status,
        });
        known.add(item.uid);
        change(`imported new Google task "${item.summary}" as a chore for ${memberName(member.id)}`);
        choresChanged = true;
      }
    }

    /** Push/pull one (task-in-a-list) pair against its sync link. */
    const reconcileLink = async (entityId, link, beaconStatus, itemsByUid, onPull) => {
      const task = itemsByUid.get(link.uid);
      if (!task) {
        if (link.entity_id !== entityId) {
          // Its task was in another list (the member's list was changed in
          // Settings), or it's a link from before links recorded their
          // list: drop it, and the next pass makes the task in this list.
          await store.remove(COLLECTIONS.links, link.id);
          return { changed: false, action: `Google task ${link.uid} isn't in ${entityId}, link dropped` };
        }
        // Deleted in Google Tasks: keep the link, marked, so the task isn't
        // made again. (Dropping it had the next pass create the task again
        // within a minute.) Unassigning the chore from this member removes
        // the link; reassigning makes a new task.
        if (link.deleted_in_google) return { changed: false, quiet: true, action: 'deleted in Google Tasks, left deleted' };
        await store.update(COLLECTIONS.links, link.id, { deleted_in_google: true });
        return { changed: false, action: `Google task ${link.uid} was deleted in Google Tasks; not making it again until the chore is reassigned` };
      }
      if (link.entity_id !== entityId || link.deleted_in_google) {
        // Record which list the task is in (links from earlier builds
        // don't say), and sync a task that's back (restored in Google Tasks).
        await store.update(COLLECTIONS.links, link.id, { entity_id: entityId, deleted_in_google: false });
      }

      const setGoogleStatus = (status) => callService('todo', 'update_item', { entity_id: entityId, item: link.uid, status });
      const recordAgreed = (status) => store.update(COLLECTIONS.links, link.id, { last_synced_status: status });
      const beaconChanged = beaconStatus !== link.last_synced_status;
      const taskChanged = task.status !== link.last_synced_status;

      if (beaconChanged && !taskChanged) {
        await setGoogleStatus(beaconStatus);
        await recordAgreed(beaconStatus);
        return { changed: false, action: `pushed ${beaconStatus} to Google` };
      }
      if (taskChanged && !beaconChanged) {
        await onPull(task.status);
        await recordAgreed(task.status);
        return { changed: true, action: `pulled ${task.status} into Family` };
      }
      if (beaconChanged && taskChanged && beaconStatus !== task.status) {
        const resolved = beaconStatus === 'completed' || task.status === 'completed' ? 'completed' : 'needs_action';
        let changed = false;
        if (resolved !== beaconStatus) {
          await onPull(resolved);
          changed = true;
        }
        if (resolved !== task.status) await setGoogleStatus(resolved);
        await recordAgreed(resolved);
        return { changed, action: `both changed, resolved to ${resolved}` };
      }
      if (beaconChanged && taskChanged) {
        // Both sides changed the same way. Record it, or a later change on
        // one side would be mistaken for the other side changing back.
        await recordAgreed(beaconStatus);
        return { changed: false, action: `both changed to ${beaconStatus}, recorded` };
      }
      return { changed: false, action: 'in sync' };
    };

    // --- Reconcile every (chore, assigned+synced member) pair ---
    const desiredChoreKeys = new Set();
    for (const chore of chores) {
      for (const memberId of chore.assigned_to ?? []) {
        const entityId = listByMember[memberId];
        if (!entityId) continue;
        const key = `${chore.id}:${memberId}`;
        desiredChoreKeys.add(key);

        // One pair HA rejects (a Google error, a read-only list) no longer
        // stops the pass: it used to fail at the same pair every minute,
        // and no chore after it ever synced.
        try {
          await syncPair(chore, memberId, entityId, key);
        } catch (err) {
          warn(`"${chore.name}" for ${memberName(memberId)}: ${errorMessage(err)}; will try again next pass`);
        }
      }
    }

    async function syncPair(chore, memberId, entityId, key) {
      const beaconStatus = currentCompletions.some((c) => c.chore_id === chore.id && c.member_id === memberId)
        ? 'completed'
        : 'needs_action';
      const link = linksByKey.get(key);
      const items = itemsByEntity.get(entityId);
      const label = `"${chore.name}" for ${memberName(memberId)}`;
      if (!items) return; // list unreadable this pass
      const itemsByUid = new Map(items.filter((it) => it.uid).map((it) => [it.uid, it]));

      if (!link) {
        const known = knownUids(entityId);
        let match = findUnlinkedTask(items, known, chore, memberId);
        const relinked = !!match;
        if (!match) {
          await callService('todo', 'add_item', { entity_id: entityId, item: formatChoreTitle(chore) });
          const fresh = await fetchTodoItems(entityId).catch(() => null);
          if (fresh) {
            itemsByEntity.set(entityId, fresh);
            match = findUnlinkedTask(fresh, known, chore, memberId);
          }
        }
        if (match?.uid) {
          // Baseline 'needs_action', not the task's current status: a
          // re-found task may have been ticked in Google meanwhile, and
          // recording that as already agreed would make the next pass
          // push Family's "not done" over it. From this baseline a tick
          // on either side counts as a change, and done wins.
          await store.add(COLLECTIONS.links, {
            chore_id: chore.id, member_id: memberId, uid: match.uid, entity_id: entityId,
            last_synced_status: 'needs_action', last_synced_title: match.summary,
          });
          known.add(match.uid);
          change(`${label}: ${relinked ? 're-linked existing' : 'created'} Google task ${match.uid} (google=${match.status} family=${beaconStatus})`);
        } else {
          warn(`${label}: created Google task but couldn't find it afterwards`);
        }
        return;
      }

      // Other Family-created tasks for this same chore are duplicates left
      // by earlier builds. Only removed while the linked task exists, so
      // the last copy is never deleted.
      if (itemsByUid.has(link.uid)) {
        const marker = legacyChoreMarker(chore.id, memberId);
        const dups = items.filter((it) => it.uid && it.uid !== link.uid && it.description?.includes(marker));
        for (const dup of dups) {
          change(`${label}: deleting duplicate Google task ${dup.uid}`);
          await callService('todo', 'remove_item', { entity_id: entityId, item: dup.uid }, { reason: `chores-sync: duplicate task for ${key}` }).catch(() => {});
        }
      }

      const linkedTask = itemsByUid.get(link.uid);
      if (linkedTask?.description?.includes(LEGACY_MARKER_PREFIX)) {
        change(`${label}: removing legacy tag from task notes`);
        await callService('todo', 'update_item', {
          entity_id: entityId, item: link.uid, description: stripLegacyMarker(linkedTask.description),
        }).catch((err) => warn(`${label}: couldn't clean notes: ${errorMessage(err)}`));
      }

      const googleStatus = linkedTask?.status ?? 'missing';
      const { changed, action, quiet } = await reconcileLink(
        entityId, link, beaconStatus, itemsByUid,
        async (status) => {
          if (status === 'completed') await completeChore(chore, memberId);
          else await uncompleteChore(chore, memberId);
        },
      );
      const line = `${label}: family=${beaconStatus} google=${googleStatus} lastAgreed=${link.last_synced_status} -> ${action}`;
      if (action === 'in sync' || quiet) note(line);
      else change(line);
      if (changed) choresChanged = true;

      if (linkedTask && !link.deleted_in_google) await syncTitle(chore, link, linkedTask, entityId, label);
    }

    /**
     * Titles, like statuses, against the last one both sides agreed on:
     * renaming a chore in Family renames its Google task, and renaming the
     * task renames the chore. Family wins if both changed. (Only the status
     * used to sync, so a renamed chore kept its old title in Google.)
     */
    async function syncTitle(chore, link, task, entityId, label) {
      const familyTitle = formatChoreTitle(chore);
      const agreed = link.last_synced_title;
      const googleChanged = agreed !== undefined && task.summary !== agreed;
      const familyChanged = agreed === undefined ? task.summary !== familyTitle : familyTitle !== agreed;
      if (!familyChanged && googleChanged) {
        const name = choreNameFromTitle(task.summary, chore);
        await store.update(COLLECTIONS.chores, chore.id, { name });
        chore.name = name; // this chore's other members' tasks follow this pass
        change(`${label}: renamed in Google Tasks to "${task.summary}", renamed the chore`);
        choresChanged = true;
        await store.update(COLLECTIONS.links, link.id, { last_synced_title: task.summary });
        return;
      }
      if (familyChanged && task.summary !== familyTitle) {
        await callService('todo', 'update_item', { entity_id: entityId, item: link.uid, rename: familyTitle });
        change(`${label}: renamed the Google task to "${familyTitle}"`);
      }
      if (agreed !== familyTitle) await store.update(COLLECTIONS.links, link.id, { last_synced_title: familyTitle });
    }

    for (const link of linksByKey.values()) {
      if (desiredChoreKeys.has(choreLinkKey(link))) continue;
      const entityId = listByMember[link.member_id];
      if (entityId && !link.deleted_in_google) {
        const items = itemsByEntity.get(entityId);
        if (!items) continue; // list unreadable: next pass (see duplicate links above)
        if (items.some((it) => it.uid === link.uid)) {
          change(`link for ${choreLinkKey(link)} has no matching assigned chore: deleting Google task ${link.uid}`);
          try {
            await callService('todo', 'remove_item', { entity_id: entityId, item: link.uid }, { reason: `chores-sync: chore link ${choreLinkKey(link)} no longer matches an assigned chore` });
          } catch (err) {
            warn(`couldn't delete Google task ${link.uid}, will try again: ${errorMessage(err)}`);
            continue;
          }
        }
      }
      await store.remove(COLLECTIONS.links, link.id);
    }

    return { outcome: 'ok', changed: choresChanged };
  }

  /**
   * One pass, with its report. `verbose` (Sync Now) logs every decision;
   * otherwise only changes are logged, and warnings only when they differ
   * from the previous pass's (an unavailable list would otherwise add a
   * line every minute).
   */
  async function pass(verbose) {
    const lines = []; // { text, kind: 'detail' | 'change' | 'warning' }
    const problems = [];
    const context = {
      note: (text) => lines.push({ text, kind: 'detail' }),
      change: (text) => lines.push({ text, kind: 'change' }),
      warn: (text) => lines.push({ text, kind: 'warning' }),
      problem: (text) => problems.push(text),
    };

    let result;
    try {
      result = await syncOnce(context);
    } catch (err) {
      context.warn(`sync failed: ${errorMessage(err)}`);
      result = { outcome: 'failed', changed: false, error: errorMessage(err) };
    }

    const finishedAt = now().toISOString();
    if (result.outcome === 'ok') {
      state.lastSyncedAt = finishedAt;
      state.lastError = null;
      state.problems = problems;
    } else if (result.outcome === 'failed') {
      state.lastError = result.error;
    }
    if (result.changed) state.lastChangeAt = finishedAt;

    const warnings = lines.filter((l) => l.kind === 'warning').map((l) => l.text);
    if (verbose) {
      log('Sync Now report:');
      for (const l of lines) log(`  ${l.text}`);
    } else {
      for (const l of lines) {
        if (l.kind === 'change' || (l.kind === 'warning' && !previousWarnings.has(l.text))) log(l.text);
      }
    }
    previousWarnings = new Set(warnings);

    return { outcome: result.outcome, changed: result.changed, report: lines.map((l) => l.text) };
  }

  /** Run the next regular pass in `delayMs`, unless one is due sooner. */
  function schedule(delayMs) {
    if (!started) return;
    const dueAt = Date.now() + delayMs;
    if (timer && timerDueAt <= dueAt) return;
    clearTimeout(timer);
    timerDueAt = dueAt;
    timer = setTimeout(() => {
      timer = null;
      void runNow();
    }, delayMs);
    timer.unref?.();
  }

  /**
   * Run a pass as soon as the one in progress (if any) has finished. Passes
   * never overlap: two at once could both import the same new Google task.
   */
  function runNow({ verbose = false } = {}) {
    activePasses++;
    const result = queue.then(() => pass(verbose));
    queue = result.catch(() => {});
    return result.finally(() => {
      activePasses--;
      schedule(intervalMs);
    });
  }

  return {
    runNow,

    /** Start the regular passes (the first after `initialDelayMs`). */
    start({ initialDelayMs = 15_000 } = {}) {
      started = true;
      schedule(initialDelayMs);
    },

    stop() {
      started = false;
      clearTimeout(timer);
      timer = null;
    },

    /**
     * Something in Family changed (a chore or completion): push it to
     * Google shortly. Later requests don't postpone an already-scheduled
     * pass, so a burst of edits can't keep delaying it.
     */
    requestSoon() {
      schedule(soonDelayMs);
    },

    /** The settings file was written: sync soon if the sync setup changed. */
    async settingsChanged() {
      let settings;
      try {
        settings = await readSettings();
      } catch {
        return;
      }
      if (syncConfigKey(settings) !== lastConfigKey) schedule(soonDelayMs);
    },

    status() {
      return { running: activePasses > 0, ...state, problems: [...state.problems] };
    },
  };
}

module.exports = { createChoresSync, COLLECTIONS, dayKeyFormatter };
