'use strict';

/**
 * Add-on startup writes Home Assistant's beacon_token secret.
 *
 * Only runs when the key is absent. A later start leaves an existing key
 * alone, so restarts do not create another token. If someone revokes the
 * token in Settings → Devices and deletes the beacon_token line, the next
 * start mints a new one. The raw token is written into secrets.yaml and
 * is never logged.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const INSTALLER_TOKEN_LABEL = 'Home Assistant automations (installer)';
const ADDED_LOG = 'added beacon_token to secrets.yaml';

/** Top-level beacon_token key. Comments and indented lines do not count. */
function hasBeaconTokenKey(text) {
  return String(text || '').split(/\r?\n/).some((line) => {
    if (!line || line.startsWith('#') || /^\s/.test(line)) return false;
    return /^(["']?)beacon_token\1\s*:/.test(line);
  });
}

function quoteYaml(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * @param {{
 *   secretsPath: string,
 *   createToken: (label: string) => Promise<{ token: string, session: { id: string } }>,
 *   revokeToken?: (id: string) => Promise<unknown>,
 * }} options
 */
async function ensureBeaconToken(options) {
  const secretsPath = options.secretsPath;
  const parent = path.dirname(secretsPath);
  try {
    await fsp.access(parent, fs.constants.W_OK);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EACCES') return { added: false };
    throw err;
  }

  let existing = null;
  let mode = 0o600;
  try {
    existing = await fsp.readFile(secretsPath, 'utf8');
    const stat = await fsp.stat(secretsPath);
    mode = stat.mode & 0o777;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  if (existing !== null && hasBeaconTokenKey(existing)) {
    return { added: false };
  }

  const created = await options.createToken(INSTALLER_TOKEN_LABEL);
  const line = `beacon_token: ${quoteYaml(`Bearer ${created.token}`)}\n`;
  let body;
  if (existing === null) {
    body = line;
    mode = 0o600;
  } else {
    const prefix = existing.length === 0 || existing.endsWith('\n') ? existing : `${existing}\n`;
    body = `${prefix}${line}`;
  }

  const tmp = `${secretsPath}.${process.pid}.tmp`;
  try {
    await fsp.writeFile(tmp, body, { encoding: 'utf8', mode: 0o600 });
    await fsp.chmod(tmp, mode);
    await fsp.rename(tmp, secretsPath);
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {});
    if (created.session && created.session.id && options.revokeToken) {
      await options.revokeToken(created.session.id);
    }
    throw err;
  }
  return { added: true };
}

module.exports = {
  ADDED_LOG,
  INSTALLER_TOKEN_LABEL,
  ensureBeaconToken,
  hasBeaconTokenKey,
};
