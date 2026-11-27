import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('pairing UI and middleware are mounted in both trees', () => {
  it('wires the pairing screen, settings list, and server gate', () => {
    for (const tree of ['src', 'beacon/src']) {
      const app = readFileSync(`${tree}/App.tsx`, 'utf8');
      expect(app).toContain('PairDeviceScreen');
      expect(app).toContain('useDevicePairing');
      expect(app).toContain('<PairDeviceScreen');

      const settings = readFileSync(`${tree}/components/SettingsView.tsx`, 'utf8');
      expect(settings).toContain('<PairedDevicesSettings');
      expect(settings).toContain("'devices'");

      const main = readFileSync(`${tree}/main.tsx`, 'utf8');
      expect(main).toContain('installDeviceSessionFetch');
      expect(main).toContain('loadDeviceSession');
    }

    for (const file of ['server.js', 'beacon/server.js']) {
      const server = readFileSync(file, 'utf8');
      expect(server).toContain('requireSession');
      expect(server).toContain('isTrustedIngress');
      expect(server).toContain("error: 'pairing_required'");
      expect(server).toContain('handlePair');
      expect(server).toContain("pathname === '/health'");
      expect(server).toContain("pathname === '/beacon-auth/pairing-code/rotate'");
      expect(server).toContain('credentialRequired');
      expect(server).toContain("pathOnly === '/beacon-ws/ha'");
      expect(server).toContain("req.url.startsWith('/api/websocket')");
      expect(server).not.toContain("headers['x-ingress-path']");
      expect(server).not.toContain('headers["x-ingress-path"]');
    }
  });
});
