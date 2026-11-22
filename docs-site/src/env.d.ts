/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly GITHUB_EDIT_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
