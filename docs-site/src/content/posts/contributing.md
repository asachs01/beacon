---
title: "Contributing"
date: 2026-03-22
description: "How to set up a development environment, understand Beacon's architecture, and submit your first pull request."
categories: ["docs"]
tags: ["contributing", "development", "open-source"]
slug: "contributing"
draft: false
---

# Contributing to Beacon

Beacon is open source and contributions are welcome. Whether you're fixing a typo, improving documentation, or building a new feature, this guide will help you get started.

---

## Development setup

### Prerequisites

- **Node.js** 20 or later
- **Docker** (for building the Home Assistant add-on container)
- **Home Assistant** development instance (optional, but recommended for testing)
- **Git**

### Clone and install

```bash
git clone https://github.com/asachs01/beacon.git
cd beacon
npm install
```

### Run the development server

```bash
npm run dev
```

This starts a local development server with hot reload. The dashboard will be available at `http://localhost:5173`.

### Run tests

```bash
npm test
```

### Build the add-on container

```bash
docker build -t beacon-addon .
```

---

## Architecture overview

Beacon is structured as a Home Assistant add-on with a web frontend:

```
beacon/
  config.yaml          # HA add-on manifest
  Dockerfile           # Container build
  rootfs/              # Add-on runtime files
    etc/
      services.d/      # s6 service definitions
    opt/
      beacon/          # Application code
        src/
          components/  # UI components
          lib/         # Shared utilities
          stores/      # State management
        public/        # Static assets
  docs/                # Documentation source
  docs-site/           # This documentation site
```

### Key technologies

| Layer | Technology |
|-------|-----------|
| Frontend | Svelte (compiled, lightweight) |
| Styling | CSS custom properties, no framework |
| Calendar data | Home Assistant WebSocket API |
| Weather data | Home Assistant REST API |
| Container | Alpine Linux, s6-overlay |
| Build | Vite |

### Data flow

1. **Home Assistant** collects calendar and weather data from configured integrations
2. **Beacon's backend** (a lightweight Node.js server inside the add-on container) connects to Home Assistant's WebSocket API
3. **The frontend** receives real-time updates and renders the dashboard
4. **The display** shows the dashboard in a fullscreen browser

---

## Submitting a pull request

### 1. Find or create an issue

Before writing code, check [GitHub Issues](https://github.com/asachs01/beacon/issues) to see if someone is already working on what you have in mind. If not, open an issue describing what you'd like to do.

### 2. Fork and branch

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR-USERNAME/beacon.git
cd beacon
git checkout -b my-feature
```

### 3. Make your changes

- Follow the existing code style (Prettier is configured)
- Add tests for new functionality
- Update documentation if your change affects user-facing behavior

### 4. Test locally

```bash
npm test
npm run build
```

If your change affects the dashboard UI, test it in a browser at multiple viewport sizes. Beacon targets landscape displays (1280x800 and up) but should degrade gracefully.

### 5. Submit the PR

```bash
git push origin my-feature
```

Open a pull request on GitHub. In the description:

- Link to the related issue
- Describe what you changed and why
- Include screenshots if the change is visual

### 6. Review process

A maintainer will review your PR. We aim to respond within a few days. You might be asked to make changes — that's normal and part of the process.

---

## What to contribute

Not sure where to start? Here are some areas where help is especially welcome:

- **Documentation improvements** — clearer explanations, more examples, better organization
- **Accessibility** — screen reader support, keyboard navigation, ARIA attributes
- **Localization** — translations for greetings, labels, and time formats
- **Calendar integrations** — better support for CalDAV edge cases
- **Performance** — faster rendering, smaller bundle size, reduced memory usage

---

## Code of conduct

Be kind, be respectful, be constructive. We're building a family tool — let's make the community feel like one too.

---

## Thank you

Every contribution matters, from a one-line typo fix to a major feature. Thank you for helping make Beacon better for families everywhere.
