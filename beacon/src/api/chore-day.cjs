'use strict';

// Re-export so the SPA and tests require the same helper the add-on server uses.
// The implementation lives in lib/ because the add-on image only ships lib/.
module.exports = require('../../lib/chore-day.cjs');
