<p align="center">
  <img src="src/assets/beacon-logo-main.png" alt="Beacon" width="280" />
</p>

<h3 align="center">Your family's daily signal</h3>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/asachs01/beacon/releases"><img src="https://img.shields.io/github/v/release/asachs01/beacon" alt="Version" /></a>
  <a href="https://github.com/asachs01/beacon/stargazers"><img src="https://img.shields.io/github/stars/asachs01/beacon" alt="Stars" /></a>
</p>

<p align="center">
  Beacon is a free, open-source family calendar and command center designed for wall-mounted displays. It runs as a Home Assistant add-on, turning any tablet or spare screen into a beautiful family dashboard — no subscription fees, no cloud dependency, and no $650 price tag.
</p>

<p align="center">
  <img src="src/assets/beacon-mockup-dark-light.png" alt="Beacon screenshot showing dark and light themes" width="720" />
</p>

---

## Features

- **Weekly Calendar** -- Skylight-style week view with color-coded family members
- **Chore Tracking** -- Assign chores, track streaks, and celebrate completions with a family leaderboard
- **Weather** -- Real-time weather from your Home Assistant weather entity
- **Themes** -- Seven built-in themes (Skylight, Nord, Dracula, Monokai, Rose, Forest, Midnight)
- **Grocery Lists** -- Grocy and AnyList integration for shared shopping lists
- **Music Control** -- Control Home Assistant media players from the display
- **Photo Slideshows** -- Display family photos between interactions
- **Dark Mode** -- Automatic or manual dark/light mode switching
- **Family Management** -- Per-member colors, filtering, and PIN-based profiles
- **Meal Planning** -- Meal plan bar with weekly dinner overview

## Quick Start

### Home Assistant Add-on (Recommended)

1. In Home Assistant, go to **Settings > Add-ons > Add-on Store**
2. Click the menu (three dots) and select **Repositories**
3. Add: `https://github.com/asachs01/beacon`
4. Find **Beacon** in the store and click **Install**
5. Start the add-on and click **Open Web UI**

### Development Setup

```bash
git clone https://github.com/asachs01/beacon.git
cd beacon
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

Beacon is configured through the Home Assistant add-on options panel:

| Option | Default | Description |
|--------|---------|-------------|
| `weather_entity` | `weather.home` | Home Assistant weather entity ID |

Additional settings (themes, family members, chores) are configured through the Beacon UI itself.

## How Beacon Compares

| | Skylight | DAKBoard | **Beacon** |
|---|:---:|:---:|:---:|
| **Cost** | $650+ | $200+ | **Free** |
| **Subscription** | Optional | $5/mo for Pro | **None** |
| **Calendar** | Yes | Yes | **Yes** |
| **Chores** | Yes | No | **Yes** |
| **Weather** | Yes | Yes | **Yes** |
| **Grocery List** | No | No | **Yes** |
| **Custom Themes** | No | Limited | **7 built-in** |
| **Dark Mode** | No | No | **Yes** |
| **Open Source** | No | No | **Yes** |
| **Local / Private** | No (cloud) | No (cloud) | **Yes** |
| **Home Assistant** | No | No | **Native** |

## Built With

- [React 19](https://react.dev/) -- UI framework
- [TypeScript](https://www.typescriptlang.org/) -- Type safety
- [Vite](https://vitejs.dev/) -- Build tool
- [Home Assistant](https://www.home-assistant.io/) -- Smart home platform
- [Lucide](https://lucide.dev/) -- Icons
- [date-fns](https://date-fns.org/) -- Date utilities

## Documentation

- [Contributing Guide](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Security Policy](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [License](LICENSE)

## Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

## License

Beacon is [MIT licensed](LICENSE). Copyright 2026 Aaron Sachs.
