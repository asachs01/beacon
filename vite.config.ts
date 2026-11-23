import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const NODE_BUILTINS = [
  'fs',
  'fs/promises',
  'path',
  'crypto',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'node:url',
  'node:crypto',
];

/**
 * Vite's dev server serves `.cjs` as raw CommonJS, so a named import such as
 * `export { localDayKey } from './local-day-key.cjs'` fails in the browser
 * and the app stays blank. Bundle those files to ESM and re-export each key.
 * Vitest and the Node MCP server keep requiring the original files.
 */
function beaconCjsNamedExports(): Plugin {
  return {
    name: 'beacon-cjs-named-exports',
    enforce: 'pre',
    apply: 'serve',
    async transform(_code, id, options) {
      if (options?.ssr || process.env.VITEST) return null;
      const file = id.split('?')[0];
      if (!file.endsWith('.cjs') || file.includes('node_modules')) return null;

      const built = await esbuild.build({
        absWorkingDir: fileURLToPath(new URL('.', import.meta.url)),
        entryPoints: [file],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        logLevel: 'silent',
        external: NODE_BUILTINS,
      });
      const bundled = built.outputFiles[0]?.text ?? '';
      const match = bundled.match(/export default ([\s\S]+);\s*$/);
      if (!match) return null;

      const stub = `function require(id) {
  const fail = () => { throw new Error(String(id) + ' is server-only'); };
  return new Proxy(fail, {
    get: () => fail,
    apply() { throw new Error(String(id) + ' is server-only'); },
  });
}
`;
      const factory = stub + bundled.replace(/export default [\s\S]+;\s*$/, 'return ' + match[1]);
      const value = new Function(factory)();
      const names = value && typeof value === 'object'
        ? Object.keys(value).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name))
        : [];
      const named = names
        .map((name) => `export const ${name} = __beaconCjsExports[${JSON.stringify(name)}];`)
        .join('\n');
      return {
        code: `${stub}${bundled.replace(/export default [\s\S]+;\s*$/, '')}
const __beaconCjsExports = ${match[1]};
export default __beaconCjsExports;
${named}
`,
        map: null,
      };
    },
  };
}

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
  plugins: [beaconCjsNamedExports(), react()],
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
