# Beacon — Claude Code Plugin

This directory contains legacy plugin templates from upstream. The MCP
executable referenced by `.mcp.json` (`beacon/mcp-server.cjs`) is not included
in this fork, so the commands and advertised MCP tools cannot control Family.
Do not install another account's marketplace plugin as a substitute or create
an HA token for this nonfunctional integration.

## What you get

**Skills** — Domain knowledge for chores, calendars, meal plans, dashboard layout, and the MCP server.

**Commands:**
- `/create-chore` — Create a family chore with assignments and payouts
- `/family-schedule` — Per-person calendar breakdown for today
- `/whats-for-dinner` — Today's meal plan
- `/chore-status` — Chore completion status and earnings

**MCP integration is unavailable** until the missing server is implemented.
To install the supported Family application, use the [fork's installation
guide](../docs/getting-started.md) instead.

## Documentation

- [Getting started](../docs/getting-started.md)
- [AI integration status](../docs/ai-integration.md)
