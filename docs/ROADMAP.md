# Beacon Roadmap

## Vision
Make Beacon the free, open-source family command center that anyone can set up on any screen — no technical expertise required. The only cost should be the hardware (a tablet, old monitor, or Raspberry Pi).

## Phase 1: Zero-Config Standalone Mode
**Goal**: Install → 2-minute setup wizard → working dashboard

- [ ] **Setup wizard** — guided onboarding: family name, add members (name/avatar/color), enter zip code for weather, done
- [ ] **OpenWeatherMap integration** — free tier weather API, just needs zip code (no HA required)
- [ ] **PWA support** — proper service worker, offline caching, "Add to Home Screen" prompt
- [ ] **Default to standalone** — local calendar, local lists, local tasks as defaults; HA becomes optional power-user feature
- [ ] **Improve error states** — friendly messages when things aren't configured vs cryptic API errors

## Phase 2: Direct Service Integrations (No HA Required)
**Goal**: Connect to the services families already use

- [ ] **Google Calendar OAuth** — sign in with Google, see all your calendars
- [ ] **Google Photos API** — slideshow from Google Photos albums
- [ ] **Spotify Connect** — playback control, now playing, browse playlists
- [ ] **Apple Music** — MusicKit JS for Apple ecosystem families
- [ ] **iCloud Calendar** — CalDAV integration for Apple calendar users
- [ ] **Todoist / Microsoft To-Do** — task list integrations beyond HA

## Phase 3: Distribution
**Goal**: One-click install on any platform

- [ ] **Android APK** — Play Store via Capacitor (already scaffolded)
- [ ] **iOS app** — App Store via Capacitor (already scaffolded)
- [ ] **Docker one-liner** — `docker run -p 3000:3000 beacon` for self-hosting
- [ ] **Raspberry Pi image** — flash SD card, plug in monitor, boot to Beacon
- [ ] **HA Add-on Store** — submit to official HA add-on repository (currently custom repo)

## Phase 4: Polish & Delight
**Goal**: Make it feel like a premium product

- [ ] **Onboarding tutorial** — interactive walkthrough of features on first use
- [ ] **Family invite links** — share a URL to add family members from their own device
- [ ] **Kiosk mode** — auto-launch, prevent navigation away, wake on touch
- [ ] **Touch gestures** — swipe between views, pull to refresh, long-press actions
- [ ] **Notifications** — push notifications for calendar reminders, chore reminders
- [ ] **Accessibility** — screen reader support, high contrast mode, font scaling
- [ ] **i18n** — internationalization for non-English families

## Phase 5: HA Power-User Features
**Goal**: Deep smart home integration for advanced users

- [ ] **Entity dashboard widgets** — show HA sensor values, camera feeds, etc.
- [ ] **Automation triggers** — "when all chores are done, turn on movie mode"
- [ ] **Presence detection** — show relevant info based on who's home
- [ ] **Voice assistant** — built-in wake word + HA Assist integration
- [ ] **Multi-display** — different views for different screens (kitchen vs bedroom)
