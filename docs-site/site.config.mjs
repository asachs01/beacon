/**
 * Public origin of the docs site.
 *
 * Set SITE_URL (no trailing slash) to switch domains without editing call
 * sites. When it is unset or blank, DEFAULT_SITE_URL is used. Astro's
 * `site`, canonical and Open Graph URLs, JSON-LD, the sitemap, robots.txt,
 * and llms.txt all read this module.
 */
export const DEFAULT_SITE_URL = "https://beacon-family-docs.netlify.app";

/** Placeholder in docs-site/llms templates. The build replaces it with SITE_URL. */
export const SITE_URL_TOKEN = "__SITE_URL__";

export function normalizeSiteUrl(value) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_SITE_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`SITE_URL must be an absolute http(s) URL, received ${JSON.stringify(raw)}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`SITE_URL must use http or https, received ${JSON.stringify(raw)}`);
  }
  if (url.username || url.password) {
    throw new Error("SITE_URL must not include credentials");
  }
  if (url.search || url.hash) {
    throw new Error("SITE_URL must not include a query or hash");
  }
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname}`;
}

function configuredSiteUrl() {
  // Use the exact `import.meta.env.SITE_URL` expression so Vite can inline the
  // value astro.config defines. Node leaves it unset and falls through to
  // process.env, which is what astro.config and the build check read.
  const fromVite =
    typeof import.meta.env !== "undefined" && typeof import.meta.env.SITE_URL === "string"
      ? import.meta.env.SITE_URL
      : "";
  if (fromVite.trim()) return fromVite;
  const fromProcess = typeof process !== "undefined" && process.env ? process.env.SITE_URL : undefined;
  return typeof fromProcess === "string" ? fromProcess : "";
}

export const SITE_URL = normalizeSiteUrl(configuredSiteUrl());

/** Absolute URL for a site path. `pathname` may be absolute (`/docs/`) or relative. */
export function absoluteUrl(pathname = "/", siteUrl = SITE_URL) {
  const base = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  const path = String(pathname).replace(/^\/+/, "");
  return new URL(path, base).href;
}

export function applySiteUrl(text, siteUrl = SITE_URL) {
  return text.replaceAll(SITE_URL_TOKEN, siteUrl).replaceAll(DEFAULT_SITE_URL, siteUrl);
}

/** True when `value` is an absolute URL on `siteUrl` (including a path prefix). */
export function urlBelongsToSite(value, siteUrl = SITE_URL) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const expected = new URL(siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`);
  if (url.origin !== expected.origin) return false;
  const prefix = expected.pathname.replace(/\/$/, "");
  if (!prefix) return true;
  return url.pathname === prefix || url.pathname.startsWith(`${prefix}/`);
}
