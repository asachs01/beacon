'use strict';

// Re-export so the SPA, tests, and MCP server keep requiring this path.
// The implementation lives in lib/ because the add-on image only ships lib/.
module.exports = require('../../lib/local-day-key.cjs');
