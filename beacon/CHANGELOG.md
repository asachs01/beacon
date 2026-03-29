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
