import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

// Read the authoritative add-on version from config.yaml at the repo root
// (updated by the semantic-release pipeline — see .releaserc.json's
// @semantic-release/exec prepareCmd). package.json's
// "version" field is NOT the source of truth for this add-on; don't read it.
function getAppVersion(): string {
  try {
    const configPath = fileURLToPath(new URL('./config.yaml', import.meta.url));
    const configYaml = readFileSync(configPath, 'utf-8');
    const match = configYaml.match(/^version:\s*["']?([^"'\n]+)["']?\s*$/m);
    if (match) return match[1].trim();
  } catch {
    // fall through to default below
  }
  return '0.0.0';
}

export default defineConfig(({ mode }) => {
  if (Object.hasOwn(loadEnv(mode, process.cwd(), ''), 'VITE_HA_TOKEN')) {
    throw new Error('VITE_HA_TOKEN would be exposed to browsers. Remove it and rotate the token.');
  }
  return {
    plugins: [react()],
    server: {
      port: 3000,
      host: '127.0.0.1',
    },
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(getAppVersion()),
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          // React is the biggest part of the startup download and changes far
          // less often than the app, so it gets its own file: its content hash
          // (and the browser's immutable cached copy) survives app updates.
          // Only React goes here; other packages stay with the code that uses
          // them so on-demand screens keep their libraries out of startup.
          manualChunks(id) {
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          },
        },
      },
    },
  };
});
