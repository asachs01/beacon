import type { HaLiveState } from './types';

/**
 * A Home Assistant reading older than this is shown as stale instead of the
 * last value. Three hours is long enough for a quiet door or a washer that
 * only reports on change, and short enough that a dead sensor does not sit
 * on the wall looking current.
 *
 * Freshness uses the newest of last_reported, last_updated, and last_changed.
 * last_reported wins when the device has checked in without a new value.
 */
export const HOME_SENSOR_STALE_MS = 3 * 60 * 60 * 1000;

export type HomeSensorReadout =
  | { kind: 'unavailable' }
  | { kind: 'unknown' }
  | { kind: 'stale'; unit: 'min' | 'h' | 'd'; count: number }
  | { kind: 'value'; text: string; unit: string };

const OPEN_DEVICE_CLASSES = new Set(['door', 'garage_door', 'window', 'opening']);

function freshestMs(state: HaLiveState): number | null {
  const stamps = [state.last_reported, state.last_updated, state.last_changed];
  let best: number | null = null;
  for (const stamp of stamps) {
    if (!stamp) continue;
    const ms = Date.parse(stamp);
    if (!Number.isFinite(ms)) continue;
    if (best == null || ms > best) best = ms;
  }
  return best;
}

export function staleAge(ageMs: number): { unit: 'min' | 'h' | 'd'; count: number } {
  const minutes = Math.max(1, Math.floor(ageMs / 60_000));
  if (minutes < 60) return { unit: 'min', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return { unit: 'h', count: hours };
  return { unit: 'd', count: Math.floor(hours / 24) };
}

function deviceClass(state: HaLiveState): string {
  const value = state.attributes.device_class;
  return typeof value === 'string' ? value : '';
}

function unitOf(state: HaLiveState): string {
  const value = state.attributes.unit_of_measurement;
  return typeof value === 'string' ? value : '';
}

function titleWord(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Read-only text for a binary sensor. Null leaves the raw state in place. */
function binaryText(state: HaLiveState): string | null {
  const on = state.state === 'on';
  const off = state.state === 'off';
  if (!on && !off) return null;
  const kind = deviceClass(state);
  if (OPEN_DEVICE_CLASSES.has(kind)) return on ? 'Open' : 'Closed';
  if (kind === 'lock') return on ? 'Unlocked' : 'Locked';
  if (kind === 'running') return on ? 'Running' : 'Idle';
  return on ? 'On' : 'Off';
}

/**
 * What the card should show for one entity. Unavailable and unknown replace
 * the value. A stale reading replaces the value too, so the wall never
 * repeats a number or a door state that Home Assistant has not confirmed.
 */
export function readHomeSensor(state: HaLiveState, now: number): HomeSensorReadout {
  const raw = state.state.trim().toLowerCase();
  if (raw === 'unavailable') return { kind: 'unavailable' };
  if (raw === '' || raw === 'unknown') return { kind: 'unknown' };

  const heard = freshestMs(state);
  if (heard != null) {
    const age = now - heard;
    if (age >= HOME_SENSOR_STALE_MS) return { kind: 'stale', ...staleAge(age) };
  }

  const domain = state.entity_id.split('.')[0];
  if (domain === 'binary_sensor') {
    const text = binaryText(state);
    if (text) return { kind: 'value', text, unit: '' };
  }
  if (domain === 'lock' || domain === 'cover') {
    return { kind: 'value', text: titleWord(state.state), unit: '' };
  }
  return { kind: 'value', text: state.state, unit: unitOf(state) };
}
