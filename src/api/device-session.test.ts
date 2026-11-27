import { describe, expect, it } from 'vitest';
import { setDeviceSessionToken, withDeviceSession } from './device-session';

describe('native device session on Beacon URLs', () => {
  it('adds the session query only for relative Beacon URLs and the sensor bridge', () => {
    setDeviceSessionToken('native-token');
    expect(withDeviceSession('/api/media_source/local/a.jpg')).toBe('/api/media_source/local/a.jpg?session=native-token');
    expect(withDeviceSession('/beacon-api/google-photos/file/abc/one.jpg?v=1'))
      .toBe('/beacon-api/google-photos/file/abc/one.jpg?v=1&session=native-token');
    expect(withDeviceSession('https://ha.local/api/websocket')).toBe('https://ha.local/api/websocket');
    expect(withDeviceSession('wss://tablet.local/beacon-ws/ha')).toBe('wss://tablet.local/beacon-ws/ha?session=native-token');
    setDeviceSessionToken(null);
    expect(withDeviceSession('/api/states')).toBe('/api/states');
  });
});
