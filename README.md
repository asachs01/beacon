

<p align="center">
  <img src="src/assets/beacon-logo-main.png" alt="Beacon" width="280" />
</p>

<h3 align="center">Your family's daily signal</h3>

<p align="center">
  <a href="https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Ff1f1f1f1f1f1%2FFamily"><img src="https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg" alt="Add to Home Assistant" /></a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/f1f1f1f1f1f1/Family/releases"><img src="https://img.shields.io/github/v/release/f1f1f1f1f1f1/Family" alt="Version" /></a>
  <a href="https://github.com/f1f1f1f1f1f1/Family/stargazers"><img src="https://img.shields.io/github/stars/f1f1f1f1f1f1/Family" alt="Stars" /></a>
</p>

<p align="center">
  Beacon is a free, open-source family command center for wall-mounted displays. This Family fork runs as a Home Assistant add-on or a standalone Docker container connected to Home Assistant — turn any tablet or spare screen into a family dashboard without a Beacon subscription.
</p>

<p align="center">
  <img src="src/assets/beacon-mockup-dark-light.png" alt="Beacon screenshot showing dark and light themes" width="720" />
</p>

---

## Skylight alternative — without the subscription

Skylight is a polished wall calendar that charges for hardware **and** locks meal planning, photos, and other family features behind Calendar Plus (~$79/year). Beacon is the self-hosted answer: run it as a Home Assistant add-on (or standalone), keep data on your network, and use any tablet you already own.

→ [Getting started](https://beacon-family-docs.netlify.app/docs/getting-started/welcome/) · [Beacon vs Skylight](https://beacon-family-docs.netlify.app/docs/getting-started/skylight-alternative/) · Install with the Home Assistant badge above

## Features

- **Weekly Calendar** -- Beautiful week view with color-coded family members; supports HA calendar entities and a built-in local calendar
- **Grocery & Shopping Lists** -- AnyList, Home Assistant Shopping List, and local list support
- **Task / Todo Lists** -- Home Assistant todo entities and local task lists with dashboard integration
- **Chore Tracking** -- Assign chores, track streaks, and celebrate completions with a family leaderboard
- **Music Controls** -- Control Music Assistant, Home Assistant media players, and browse playlists from the display
- **Photo Slideshow** -- Display family photos between interactions
- **Timer / Countdown** -- On-screen timer for cooking, homework, and more
- **Screen Saver** -- Automatic screen saver with clock overlay
- **Weather** -- Real-time weather from your Home Assistant weather entity
- **8+ Themes** -- Skylight, Midnight, Midnight Light, Nord, Dracula, Monokai, Rose, Forest, and dark mode (automatic or manual)
- **Family Management** -- Per-member colors, calendar filtering, and PIN-based profiles
- **Meal Planning** -- Meal plan bar with weekly dinner overview
- **Standalone Docker** -- Run against Home Assistant Core without Supervisor

## Installation

### Home Assistant Add-on (Recommended)

The fastest way to get started is the one-click button:

[![Add to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Ff1f1f1f1f1f1%2FFamily)

Or install manually:

1. In Home Assistant, go to **Settings > Add-ons > Add-on Store**
2. Click the overflow menu (**...**) and select **Repositories**
3. Add: `https://github.com/f1f1f1f1f1f1/Family`
4. Find **Family** in the store and click **Install** (Home Assistant builds it from this repository's root `Dockerfile`; it does not pull the standalone GHCR image). Supervisor rebuilds only after the add-on manifest version changes through semantic-release.
5. In **Configuration**, set a private 6–8 digit `parent_pin` and list the HA entity IDs Family may access in `allowed_entities` (for example `calendar.family,todo.shopping_list,weather.home`); save, then start the add-on and click **Open Web UI** through Home Assistant ingress

> **Tip:** Enable **Show in sidebar** in the add-on's Info tab for a wall-mounted tablet. Sign in to Home Assistant on each display; the add-on is ingress-only, not available at a direct unauthenticated port.

### Standalone Docker (Home Assistant without Supervisor)

Choose a published `vX.Y.Z` tag from the [fork's GHCR package](https://github.com/f1f1f1f1f1f1/Family/pkgs/container/family). Images are published only for new releases after the image workflow is enabled; there is no `latest` tag. In an environment file **outside the repository** (restrict it to the container operator), set `HA_URL`, `HA_TOKEN` (a Home Assistant long-lived access token), `BEACON_PASSWORD` (at least 16 characters), `BEACON_PARENT_PIN` (6–8 digits), `BEACON_ALLOWED_ENTITIES` (CSV of exact HA entity IDs), and `BEACON_HOST=0.0.0.0`. An empty allowlist blocks HA entity access. The token remains server-side.

```bash
docker run -d --name family --restart unless-stopped \
  -p 127.0.0.1:3000:3000 --env-file /path/to/family.env \
  -v family-data:/data \
  ghcr.io/f1f1f1f1f1f1/family:vX.Y.Z
```

Replace `vX.Y.Z` with an available version tag. Browse `http://127.0.0.1:3000` locally; for other devices use an **HTTPS reverse proxy** in front of this loopback port. Log in with HTTP Basic username `beacon` and password `BEACON_PASSWORD`, then enter the separate parent PIN to unlock privileged actions. Parent unlock lasts **10 minutes from PIN entry**, even if the app stays open; re-enter the configured PIN afterward. Never bind the container's plain-HTTP port to the LAN—even with Basic, the password is not encrypted in transit. See the [deployment guide](https://beacon-family-docs.netlify.app/docs/getting-started/deployment/) for a Compose example.

The release workflow refuses to overwrite an existing version tag. For content-addressed deployment, use `ghcr.io/f1f1f1f1f1f1/family@sha256:<index-digest>` instead; the [deployment guide](https://beacon-family-docs.netlify.app/docs/getting-started/deployment/) shows how to find and pull that digest.

Optional non-secret Docker env settings (`THEME`, `AUTO_DARK_MODE`, `WEATHER_ENTITY`, `PHOTO_DIRECTORY`, `PHOTO_INTERVAL`, `SCREEN_SAVER_TIMEOUT`) set startup display defaults. The server writes them to `runtime-config.js`; **it never includes HA credentials**. If an earlier build used `VITE_HA_TOKEN` or stored a long-lived HA token in the browser, [revoke and replace that token](SECURITY.md) even though the new server-backed app clears its local copy.

### Development

```bash
git clone https://github.com/f1f1f1f1f1f1/Family.git
cd Family
npm ci
npm run dev -- --host 127.0.0.1
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). This is a development server, not a standalone production deployment. Do not put an HA token in `VITE_HA_TOKEN` or any bundled environment variable; if testing a direct browser/native login, enter credentials during onboarding instead.

## Configuration

Beacon is configured through the Home Assistant add-on options panel:

| Option | Default | Description |
|--------|---------|-------------|
| `weather_entity` | `weather.home` | Home Assistant weather entity ID |
| `parent_pin` | (required) | Unlocks privileged add-on actions; keep it private from shared displays |
| `allowed_entities` | empty (denies HA entity access) | Required for HA entities/services: comma-separated exact IDs (e.g. `calendar.family,todo.shopping_list,weather.home`) |

Additional settings (themes, family members, chores, calendar sources, list providers) are configured through the Beacon UI or the supported non-secret Docker env defaults above. Add-on HA access uses a server-side Supervisor token and Home Assistant ingress; `runtime-config.js` never contains an HA token.

## Why Beacon?

- **Free & open source** — no subscriptions, no cloud accounts, no vendor lock-in
- **Private by design** — HA credentials stay on the server in add-on/Docker mode; HA integrations (for example, Google Tasks) may contact external services
- **Home Assistant native** — deep integration with calendars, media players, lists, weather, and more
- **Flexible deployment** — Supervisor-built add-on or versioned standalone Docker image for HA Core
- **Fully themeable** — 8+ themes with automatic dark mode
- **Voice & LLM ready** — MCP server, voice API, and HA custom sentences for hands-free control

## Built With

- [React 19](https://react.dev/) -- UI framework
- [TypeScript](https://www.typescriptlang.org/) -- Type safety
- [Vite](https://vitejs.dev/) -- Build tool
- [Home Assistant](https://www.home-assistant.io/) -- Smart home platform
- [Capacitor](https://capacitorjs.com/) -- Native iOS/Android builds
- [Lucide](https://lucide.dev/) -- Icons
- [date-fns](https://date-fns.org/) -- Date utilities

## Documentation

- [Getting Started Guide](docs/getting-started.md) -- full walkthrough with screenshots
- [AI and Voice Control](docs/ai-integration.md) -- voice API, MCP server for LLM agents, HA Assist custom sentences
- [Contributing Guide](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Security Policy](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [License](LICENSE)

## Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

## License

Beacon is [MIT licensed](LICENSE). Copyright 2026 Aaron Sachs.
