# Beacon — Claude Code Plugin

Control your [Beacon](https://github.com/asachs01/beacon) family dashboard from Claude Code.

## What you get

**Skills** — Domain knowledge for chores, calendars, meal plans, dashboard layout, and the MCP server.

**Commands:**
- `/create-chore` — Create a family chore with assignments and payouts
- `/family-schedule` — Per-person calendar breakdown for today
- `/whats-for-dinner` — Today's meal plan
- `/chore-status` — Chore completion status and earnings

**17 MCP tools** for lists, calendar, media, weather, chores, family members, and meal plans.

## Setup

1. Install the plugin:
   ```
   /plugin add /path/to/beacon/claude-plugin
   ```

2. Set environment variables (or create `.env` from `.env.example`):
   ```bash
   export BEACON_HA_TOKEN="your-ha-long-lived-access-token"
   export BEACON_HA_URL="http://homeassistant.local:8123"
   export BEACON_DATA_DIR="/path/to/beacon/data"
   ```

3. Generate an HA token: **Profile > Security > Long-Lived Access Tokens > Create Token**

## Documentation

- [Dashboard](https://beacon-family-docs.netlify.app/docs/features/dashboard/)
- [Chores](https://beacon-family-docs.netlify.app/docs/features/chores/)
- [Calendar](https://beacon-family-docs.netlify.app/docs/features/calendar/)
- [AI Integration](https://beacon-family-docs.netlify.app/docs/reference/ai-integration/)
