/**
 * Re-export so the docs page can import the parser without the root test
 * runner loading docs-site/tsconfig.json (that config extends astro, which
 * is not installed for the app test job).
 */
export {
  formatReleaseDate,
  loadWhatsNew,
  parseChangelog,
} from '../../../src/docs-tooling/whats-new';
export type { ReleaseNote, WhatsNew } from '../../../src/docs-tooling/whats-new';
