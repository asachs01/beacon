/**
 * Fail-soft Home Assistant side effects for a chore toggle.
 *
 * Events go through the add-on server, which posts them with the Supervisor
 * token. Standalone mode has no add-on server, so events are logged and
 * skipped. The privilege service call uses callHaService (add-on proxy or
 * the standalone long-lived token). Neither path throws: a chore check must
 * still save when Home Assistant is unreachable.
 */
import { callHaService } from './ha-rest';
import { isAddOn, getIngressBasePath } from '../utils/ha-env';
import type { ChoreEvent, PrivilegeDecision } from './chore-privileges';

const HA_TIMEOUT_MS = 8000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Home Assistant request timed out')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function publishChoreEvents(events: ChoreEvent[]): Promise<void> {
  if (events.length === 0) return;
  if (!isAddOn()) {
    console.warn('[beacon] chore events skipped: standalone mode has no add-on server');
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HA_TIMEOUT_MS);
  try {
    const base = getIngressBasePath();
    const res = await fetch(`${base}/beacon-action/chore-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[beacon] chore events failed: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('[beacon] chore events failed', err);
  } finally {
    clearTimeout(timer);
  }
}

export async function applyPrivilegeDecision(decision: PrivilegeDecision | null): Promise<void> {
  if (!decision) return;
  try {
    await withTimeout(
      callHaService(decision.domain, decision.service, { entity_id: decision.entityId }),
      HA_TIMEOUT_MS,
    );
  } catch (err) {
    console.warn(`[beacon] privilege ${decision.service} ${decision.entityId} failed`, err);
  }
}

export async function applyPrivilegeDecisions(decisions: PrivilegeDecision[]): Promise<void> {
  for (const decision of decisions) {
    await applyPrivilegeDecision(decision);
  }
}
