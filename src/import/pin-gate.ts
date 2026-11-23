/**
 * Parent PIN check for Magic Import approve and reject.
 *
 * Same digits-only match as the kiosk and Kid Display gesture
 * (`pinMatches` / `configuredMemberPins`). When no family PIN is set,
 * the action is allowed, which is how kiosk navigation already behaves.
 */
import { configuredMemberPins, pinMatches } from '../display/hidden-gesture';

export type PinGateResult = 'not-required' | 'accepted' | 'rejected';

export function importPinDecision(
  members: readonly { pin?: string | null }[],
  pin: string,
): PinGateResult {
  const configured = configuredMemberPins(members);
  if (configured.length === 0) return 'not-required';
  return pinMatches(pin, configured) ? 'accepted' : 'rejected';
}
