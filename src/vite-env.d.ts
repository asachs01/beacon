/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HA_URL: string;
  readonly VITE_HA_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
