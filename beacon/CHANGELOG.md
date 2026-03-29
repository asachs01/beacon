# Changelog

All notable changes to Beacon will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Recurring event support in EventModal (daily/weekly/monthly with end date), passed as rrule to HA calendar.create_event
- Drag-to-reschedule in WeekCalendar: timed events are draggable to new time slots with ghost preview
- Multi-day event spanning bars in the all-day row, rendered across day columns with lane stacking
- PWA manifest (public/manifest.json) with Beacon branding, icons, standalone display, and iOS meta tags
- HA API updateEvent method for rescheduling events via calendar.update_event service
- Overlapping event column splitting: concurrent events render side-by-side instead of stacking
- Live current-time indicator: red line updates every 30 seconds instead of being static
- NowPlayingBar progress indicator: thin accent-color bar shows track position
- Keyboard shortcuts: press 1-9 to switch views (dashboard, calendar, chores, grocery, etc.)
- Mobile bottom tab active indicator pill along top edge
- Smooth view transitions: fade-and-slide animation when switching between views
- `prefers-reduced-motion` support: all animations/transitions disabled for accessibility
- Capacitor integration for native iOS and Android builds
- Native haptic feedback on task completion, FAB interaction (via @capacitor/haptics)
- Android back button handling: navigates back or minimizes app
- Native status bar and splash screen configuration
- npm scripts: `cap:sync`, `cap:ios`, `cap:android`, `cap:run:ios`, `cap:run:android`
- Makefile targets: `cap-sync`, `cap-ios`, `cap-android`
- Onboarding setup wizard: 3-step flow (welcome → HA URL → authentication)
- HA OAuth2 authentication: full public-client flow with token exchange and refresh
- Manual long-lived access token authentication option
- Secure token storage: native Capacitor Preferences on iOS/Android, localStorage on web
- Dynamic config patching: `patchConfig()` allows injecting credentials without page reload
- Auth gate in App.tsx: shows onboarding when running standalone without injected HA config

### Fixed
- Missing CSS imports: grocery.css and omni-add.css were not imported in main.tsx

### Improved
- Screensaver clock drift: smoother 4s cubic-bezier transition when repositioning
- OmniAdd FAB icon rotates from + to x when expanded (class-based, not just parent selector)
- Event card text colors forced dark on pastel backgrounds in dark themes
- Dashboard empty states: warmer, friendlier copy ("your day is wide open", "great job!")
- Task checklist "All done" state now uses green accent color instead of muted gray

### Changed
- Dockerfile: multi-stage build with `serve` for static assets, proper HEALTHCHECK
- run.sh: reads all options from /data/options.json, generates runtime-config.js for static build
- config.yaml: added family_name, theme, auto_dark_mode, photo_directory, photo_interval, screen_saver_timeout options
- Centralized configuration via `src/config.ts` (window.__BEACON_CONFIG__ in add-on, VITE_* in dev)
- Migrated all VITE_* env var references to use getConfig()
- repository.yaml: proper HA add-on repository discovery structure

### Added
- `src/config.ts`: unified getConfig() for add-on and dev modes
- `.github/workflows/build-addon.yml`: multi-arch Docker build on tag/release
- `Makefile`: dev, build, docker-build, docker-push, lint, typecheck targets

## [0.2.0] - 2026-03-28

### Added
- Skylight-style full-screen week calendar view
- Dashboard view with big clock, greeting, today's events, weather, tasks
- 7 themes: Skylight, Midnight, Nord, Dracula, Monokai, Rose, Forest
- Theme selector with live preview and auto dark mode
- Family member management with 55+ emoji avatars
- Chore system with streaks, earnings, and leaderboard
- Grocy integration (shopping list, expiring items, meal plan)
- AnyList integration (shared grocery lists)
- Music Assistant integration (now playing bar, full music view)
- Photo frame slideshow mode
- Left sidebar navigation
- Weather widget in header
- Event create/edit/delete via Home Assistant calendar API
- Brand assets (lighthouse logo, color palette)
- Astro docs site with astro-tinker theme

### Changed
- Rebuilt from dark three-panel layout to Skylight-style light calendar
- Switched from weather-card to clock-weather-card

## [0.1.0] - 2026-03-28

### Added
- Initial React 19 + TypeScript + Vite app
- Home Assistant WebSocket integration
- Dark mode dashboard layout
- Brand guide and documentation
- HA add-on configuration (Dockerfile, config.yaml, run.sh)
