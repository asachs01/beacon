'use strict';

// Re-export so the SPA bundles the same migration the MCP server runs.
// The implementation lives in lib/ because the add-on image ships lib/.
module.exports = require('../../lib/meal-plan-migrate.cjs');
