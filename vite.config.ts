import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

// The only add-on manifest is beacon/config.yaml. package.json's "version"
// field is NOT the source of truth for this add-on; don't read it.
function getAppVersion(): string {
  try {
    const configPath = fileURLToPath(new URL('./beacon/config.yaml', import.meta.url));
    const configYaml = readFileSync(configPath, 'utf-8');
    const match = configYaml.match(/^version:\s*["']?([^"'\n]+)["']?\s*$/m);
    if (match) return match[1].trim();
  } catch {
    // fall through to default below
  }
  return '0.0.0';
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
  },
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
