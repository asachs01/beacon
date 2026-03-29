## [1.10.3](https://github.com/asachs01/beacon/compare/v1.10.2...v1.10.3) (2026-03-29)


### Bug Fixes

* media controls fallback to media_play_pause, mobile layout height ([fe66dc8](https://github.com/asachs01/beacon/commit/fe66dc87e8b998c7d979c2fbd33c640a888143da))

## [1.10.2](https://github.com/asachs01/beacon/compare/v1.10.1...v1.10.2) (2026-03-29)


### Bug Fixes

* mobile dashboard layout — no overlap, constrained events, better sizing ([008103d](https://github.com/asachs01/beacon/commit/008103df3400944c2ec23694bf7f7124fd5a6bdd))

## [1.10.1](https://github.com/asachs01/beacon/compare/v1.10.0...v1.10.1) (2026-03-29)


### Bug Fixes

* hide completed tasks from dashboard, only show pending items ([123bb34](https://github.com/asachs01/beacon/commit/123bb342a554bb8a4cab60148e44625edbb663cc))

# [1.10.0](https://github.com/asachs01/beacon/compare/v1.9.0...v1.10.0) (2026-03-29)


### Features

* voice control, MCP server, HA custom sentences + code cleanup ([03b7133](https://github.com/asachs01/beacon/commit/03b7133d390cf8f8dee496a34cada8056f0e243d))

## [Unreleased]

### Added

* HA custom sentences and intent handlers for voice control of Beacon features
* Voice commands: add to lists, complete chores, check calendar, navigate views, set timers, query grocery/chore status
* Auto-install of voice intents into HA config on add-on startup
* Install script at `scripts/install-voice-intents.sh` for manual deployment

## [1.8.1](https://github.com/asachs01/beacon/compare/v1.8.0...v1.8.1) (2026-03-29)


### Bug Fixes

* service calls via dedicated endpoint, show app name in music view ([27410ce](https://github.com/asachs01/beacon/commit/27410cea87029a5f32126d77b95f304423076606))

# [1.8.0](https://github.com/asachs01/beacon/compare/v1.7.1...v1.8.0) (2026-03-29)


### Features

* dashboard shows todo items from HA lists, music works via REST ([513f748](https://github.com/asachs01/beacon/commit/513f748faed1f40a9eadbff7edfa7f591aacfcd1))

## [1.7.1](https://github.com/asachs01/beacon/compare/v1.7.0...v1.7.1) (2026-03-29)


### Bug Fixes

* music player works via REST API proxy (no WebSocket required) ([71f8f9c](https://github.com/asachs01/beacon/commit/71f8f9c209ec744c971c80d997c95ac3a05eb14b))

# [1.7.0](https://github.com/asachs01/beacon/compare/v1.6.0...v1.7.0) (2026-03-29)


### Features

* expand avatar emojis (150+) and color palette (20 colors) ([64c6c8f](https://github.com/asachs01/beacon/commit/64c6c8f9d461961ad3b4ef70012f3402b2cc0fc2))

# [1.6.0](https://github.com/asachs01/beacon/compare/v1.5.0...v1.6.0) (2026-03-29)


### Features

* server-side data persistence for family, settings, chores ([8bf3391](https://github.com/asachs01/beacon/commit/8bf3391b2e2950cb24f99ded23311bed7069f37a))

# [1.5.0](https://github.com/asachs01/beacon/compare/v1.4.4...v1.5.0) (2026-03-29)


### Features

* separate Lists and Tasks views with auto-categorization ([136ddc6](https://github.com/asachs01/beacon/commit/136ddc60120776d102b314b92dd972e8839a2728))

## [1.4.4](https://github.com/asachs01/beacon/compare/v1.4.3...v1.4.4) (2026-03-29)


### Bug Fixes

* route API calls through ingress path in add-on proxy mode ([2ef91e1](https://github.com/asachs01/beacon/commit/2ef91e16ca74211a5bbc79caecdbf12be5c5254a))

## [1.4.3](https://github.com/asachs01/beacon/compare/v1.4.2...v1.4.3) (2026-03-29)


### Bug Fixes

* use relative path for runtime-config.js (fixes ingress 404) ([ddf29f2](https://github.com/asachs01/beacon/commit/ddf29f28ad79541304b43773999b348b767d2ca7))

## [1.4.2](https://github.com/asachs01/beacon/compare/v1.4.1...v1.4.2) (2026-03-29)


### Bug Fixes

* calendar/lists work via API proxy without WebSocket or user token ([9840db4](https://github.com/asachs01/beacon/commit/9840db4d7415519b01791a7fa5719c682d0d1913))

## [1.4.1](https://github.com/asachs01/beacon/compare/v1.4.0...v1.4.1) (2026-03-29)


### Bug Fixes

* show calendar filter pill names on mobile instead of dot-only ([f2f19fe](https://github.com/asachs01/beacon/commit/f2f19feb96e1718ac6fe54ddad319b97c2d63d46))

# [1.4.0](https://github.com/asachs01/beacon/compare/v1.3.1...v1.4.0) (2026-03-29)


### Features

* add-on API proxy — zero-config HA connection ([e16dbf5](https://github.com/asachs01/beacon/commit/e16dbf5c3e42d6d65db2e7cb0e04e4131aebec8e))

## [1.3.1](https://github.com/asachs01/beacon/compare/v1.3.0...v1.3.1) (2026-03-29)


### Bug Fixes

* calendar layout whitespace and add-on auth/URL resolution ([0daec9f](https://github.com/asachs01/beacon/commit/0daec9f94b89b51b55926f5781e7a426fa3c7430))

# [1.3.0](https://github.com/asachs01/beacon/compare/v1.2.1...v1.3.0) (2026-03-29)


### Bug Fixes

* release workflow — upgrade to Node 22, fix sed for Linux, enable git credentials ([e6e1cac](https://github.com/asachs01/beacon/commit/e6e1caca4ef781efe94413879b8e35b5d5f194f3))


### Features

* standalone mode with local calendar/tasks, fix theme flash and calendar loading ([36609d2](https://github.com/asachs01/beacon/commit/36609d297e0ec9e3ca43eb48fb82c600b8b8d165))

# Changelog

## Unreleased

### New
- Built-in local task lists (To-Do, Shopping List) that work without any HA integration
- Built-in local calendar ("Beacon") for standalone event management
- Both local and HA-powered lists/calendars can be used side by side

### Fixed
- Theme no longer flashes to Skylight default on page load — applied before first paint
- Theme now stays active across all views (was previously only applied when visiting Settings)
- Calendar events load reliably on startup (fixed stale closure in calendar fetch)
- Leaderboard panel no longer peeks out when sidebar is positioned on the left
- Dashboard now correctly shows today's all-day events (timezone normalization fix)
- Grocery/todo lists show local lists immediately even without HA connection

## 1.2.0

### New
- Grocery lists now work with AnyList and HA Shopping List
- Onboarding wizard for standalone app setup
- Native iOS and Android app support via Capacitor
- Keyboard shortcuts: press 1-9 to switch views
- Now Playing bar shows track progress
- Smooth transitions between views

### Improved
- Calendar events that overlap now display side-by-side
- Current time indicator updates in real time
- Screensaver clock moves smoothly instead of jumping
- Better empty states throughout the app
- Mobile tab bar has an active indicator
- Accessibility: respects reduced motion preferences

### Fixed
- Grocery view now properly fetches items from HA
- Connection handling in HA ingress mode
- Event text readable on all themes
- Layout issues on mobile

## 1.0.0

### New
- Weekly calendar with drag-to-reschedule
- Dashboard with clock, weather, and daily overview
- 7 color themes with auto dark mode
- Family member management
- Chore tracking with streaks and leaderboard
- AnyList and Grocy grocery integration
- Music Assistant controls and Now Playing bar
- Photo frame slideshow
- Timer and countdown widgets
- Screen saver with floating clock
