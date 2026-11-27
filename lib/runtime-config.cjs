'use strict';

/**
 * runtime-config.js is served to every browser, including one that has not
 * paired. It must not carry a Home Assistant token, the Home Assistant URL,
 * or settings that describe the house (weather entity, photo folder, photo
 * timing, screen saver timeout, browser storage). HA_TOKEN and
 * HA_BROWSER_TOKEN are ignored on purpose. The browser talks to this Beacon
 * server, which holds the token.
 *
 * The pairing screen and the first paint read only the display chrome below.
 * After a paired session, an access token, or trusted ingress, the shell
 * loads the rest from GET /beacon-api/runtime-config.
 */

/** Keys that may appear in the public runtime-config.js script. */
const PUBLIC_RUNTIME_CONFIG_KEYS = ['family_name', 'theme', 'auto_dark_mode'];

function buildRuntimeConfig(env = {}) {
  return {
    ha_url: env.HA_URL || '',
    family_name: env.FAMILY_NAME || 'My Family',
    save_config_in_browser: env.SAVE_CONFIG_IN_BROWSER !== 'false',
    theme: env.THEME || 'skylight',
    auto_dark_mode: env.AUTO_DARK_MODE !== 'false',
    weather_entity: env.WEATHER_ENTITY || 'weather.home',
    photo_directory: env.PHOTO_DIRECTORY || '/media/beacon/photos',
    photo_interval: parseInt(env.PHOTO_INTERVAL, 10) || 30,
    screen_saver_timeout: parseInt(env.SCREEN_SAVER_TIMEOUT, 10) || 5,
  };
}

function buildPublicRuntimeConfig(env = {}) {
  const full = buildRuntimeConfig(env);
  const pub = {};
  for (const key of PUBLIC_RUNTIME_CONFIG_KEYS) {
    pub[key] = full[key];
  }
  return pub;
}

function renderRuntimeConfig(env) {
  return `window.__BEACON_CONFIG__ = ${JSON.stringify(buildPublicRuntimeConfig(env))};`;
}

const HA_BROWSER_TOKEN_WARNING = 'HA_BROWSER_TOKEN is no longer used and is ignored; the browser now goes through Beacon\'s server';

function warnIfBrowserTokenSet(env = process.env, log = console.warn) {
  if (env.HA_BROWSER_TOKEN) log(HA_BROWSER_TOKEN_WARNING);
}

module.exports = {
  HA_BROWSER_TOKEN_WARNING,
  PUBLIC_RUNTIME_CONFIG_KEYS,
  buildPublicRuntimeConfig,
  buildRuntimeConfig,
  renderRuntimeConfig,
  warnIfBrowserTokenSet,
};
