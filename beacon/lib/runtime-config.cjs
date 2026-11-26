'use strict';

/**
 * runtime-config.js is served to every browser. It must not carry a Home
 * Assistant token. HA_TOKEN and HA_BROWSER_TOKEN are ignored on purpose.
 * The browser talks to this Beacon server, which holds the token.
 */

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

function renderRuntimeConfig(env) {
  return `window.__BEACON_CONFIG__ = ${JSON.stringify(buildRuntimeConfig(env))};`;
}

const HA_BROWSER_TOKEN_WARNING = 'HA_BROWSER_TOKEN is no longer used and is ignored; the browser now goes through Beacon\'s server';

function warnIfBrowserTokenSet(env = process.env, log = console.warn) {
  if (env.HA_BROWSER_TOKEN) log(HA_BROWSER_TOKEN_WARNING);
}

module.exports = {
  HA_BROWSER_TOKEN_WARNING,
  buildRuntimeConfig,
  renderRuntimeConfig,
  warnIfBrowserTokenSet,
};
