/**
 * Parent PIN check for Magic Import approve and reject.
 *
 * Whether a family PIN is configured is known from `hasPin` (or a stale
 * plaintext field that only means "ask"). The digits are checked with
 * POST /beacon-auth/verify-pin. When no family PIN is set, the action is
 * allowed, which is how kiosk navigation already behaves.
 * The guest PIN is not a family PIN and is never accepted here.
 */
import { familyPinConfigured } from '../display/hidden-gesture';

export function importPinRequired(
  members: readonly { hasPin?: boolean; pin?: string | null }[],
): boolean {
  return familyPinConfigured(members);
}
