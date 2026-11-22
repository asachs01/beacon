/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly GITHUB_EDIT_BASE?: string;
  readonly SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
