/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HA_URL: string;
  readonly VITE_HA_TOKEN: string;
  /** Set only by `vite build --mode demo` for docs screenshots. */
  readonly VITE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected at build time by vite.config.ts from beacon/config.yaml's `version:` field. */
declare const __APP_VERSION__: string;
