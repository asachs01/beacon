---
title: "Contributing"
date: 2026-03-22
description: "Architecture deep dive, development setup, and guides for adding themes, sidebar views, and integrations to Beacon."
categories: ["docs"]
tags: ["contributing", "development", "open-source", "architecture"]
slug: "contributing"
draft: false
---

# Contributing to Beacon

Beacon is open source and contributions are welcome. This guide covers the architecture in detail, development setup, and step-by-step guides for common contribution tasks.

---

## Development setup

### Prerequisites

- **Node.js** 20 or later
- **npm** 9 or later
- **Git**
- **Docker** (for building the HA add-on container)
- **A Home Assistant instance** (recommended for testing)

### Clone and install

```bash
git clone https://github.com/asachs01/beacon.git
cd beacon
npm install
```

### Configure for development

Create a `.env` file in the project root (see [Configuration](/docs/configuration/) for all options):

```bash
VITE_HA_URL=http://YOUR_HA_IP:8123
VITE_HA_TOKEN=YOUR_LONG_LIVED_ACCESS_TOKEN
VITE_FAMILY_NAME="Dev Family"
VITE_THEME=skylight
```

### Run the development server

```bash
npm run dev
```

Open `http://localhost:5173`. The dev server supports hot module replacement — changes to components, hooks, and styles apply without a full page reload.

### Run tests

```bash
npm test
```

### Build for production

```bash
npm run build
```

Output goes to `dist/`. To test the production build locally:

```bash
npx serve dist -l 3000 -s
```

### Build the Docker container

```bash
docker build -t beacon-dev .
docker run -d -p 3000:3000 \
  -e SUPERVISOR_TOKEN="..." \
  -e HA_URL="..." \
  beacon-dev
```

---

## Architecture deep dive

### Technology stack

| Layer | Technology | Why |
|-------|-----------|-----|
| UI Framework | React 18 | Component model, hooks, large ecosystem |
| Language | TypeScript | Type safety, better IDE support |
| Build tool | Vite | Fast HMR, optimized production builds |
| Styling | CSS (no framework) | Custom properties for theming, minimal bundle |
| Icons | Lucide React | Consistent icon set, tree-shakeable |
| Date handling | date-fns | Modular, lightweight date utilities |
| HA Communication | WebSocket API | Real-time bidirectional communication |
| Container | Alpine Linux + serve | Minimal image size, static file serving |

### Directory structure

```
beacon/
  config.yaml               # HA add-on manifest
  Dockerfile                 # Multi-stage Docker build
  run.sh                     # Container entry point (runtime config injection)
  package.json               # Dependencies and scripts
  vite.config.ts             # Vite build configuration
  src/
    main.tsx                 # App entry point, React root
    App.tsx                  # Root component, view routing, state management
    config.ts                # Runtime configuration resolver
    types.ts                 # Calendar and weather types
    types/
      family.ts              # Family member, chore, streak types
      grocery.ts             # Grocery item, list, meal plan types
      music.ts               # Media player types
      photos.ts              # Photo, photo config types
    api/
      homeassistant.ts       # WebSocket client for HA API
      family.ts              # Family data store (localStorage + HA sync)
      grocy.ts               # Grocy REST API client
      anylist.ts             # AnyList REST API client
      music.ts               # Media player API (play, pause, volume, etc.)
      photos.ts              # Photo loading from HA media browser
    hooks/
      useHomeAssistant.ts    # HA WebSocket connection hook
      useCalendarEvents.ts   # Calendar CRUD operations
      useFamily.ts           # Family member management
      useChores.ts           # Chore and streak management
      useWeather.ts          # Weather data polling
      useMusic.ts            # Media player state and controls
      usePhotos.ts           # Photo slideshow state
      useGrocery.ts          # Grocery list integration
      useMealPlan.ts         # Meal plan from Grocy
      useNotifications.ts    # Event notification system
      useTheme.ts            # Theme management and CSS property injection
    components/
      Sidebar.tsx            # Navigation sidebar (desktop) + bottom tab bar (mobile)
      DashboardView.tsx      # Dashboard layout (clock, events, weather, tasks)
      WeekCalendar.tsx       # Full week calendar grid with drag-and-drop
      EventBlock.tsx         # Single event block in calendar grid
      EventCard.tsx          # Event card in dashboard today view
      EventModal.tsx         # Create/edit event modal
      FamilyFilter.tsx       # Calendar filter pills
      FamilyManager.tsx      # Family member CRUD modal
      ChoresPanel.tsx        # Chore management slide panel
      ChoreCard.tsx          # Single chore card with checkbox
      Leaderboard.tsx        # Earnings leaderboard slide panel
      StreakBadge.tsx         # Fire streak badge component
      TaskChecklist.tsx       # Dashboard task checklist
      CountdownWidget.tsx    # Dashboard countdown widget
      GroceryDrawer.tsx      # Grocery list expandable drawer
      MealPlanBar.tsx        # Meal plan summary bar
      MusicView.tsx          # Full music player view
      NowPlayingBar.tsx      # Persistent now-playing bar
      PhotoFrame.tsx         # Photo frame with slideshow
      Clock.tsx              # Mini clock for header
      WeatherWidget.tsx      # Weather popup widget
      Timer.tsx              # Timer/stopwatch component
      ScreenSaver.tsx        # Dim mode and clock screensaver
      ThemeSelector.tsx      # Theme picker dropdown
      ThemeToggle.tsx        # Light/dark toggle (legacy)
    styles/
      beacon.css             # Main layout styles
      dashboard.css          # Dashboard view styles
      family.css             # Family manager styles
      grocery.css            # Grocery drawer styles
      music.css              # Music view styles
      photos.css             # Photo frame styles
      screensaver.css        # Screen saver styles
      theme-base.css         # Base theme CSS custom properties
      dark-theme.css         # Dark theme overrides
      widgets.css            # Widget styles (weather, countdown, etc.)
      themes/
        index.ts             # Theme registry and lookup
        skylight.ts          # Skylight theme definition
        midnight.ts          # Midnight theme definition
        nord.ts              # Nord Ice theme definition
        dracula.ts           # Dracula theme definition
        monokai.ts           # Monokai theme definition
        rose.ts              # Rose theme definition
        forest.ts            # Forest theme definition
```

### Data flow diagram

```
                    +------------------+
                    |  Google Calendar  |
                    |  CalDAV / ICS    |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    | Home Assistant    |
                    | (calendar, weather|
                    | media_player,    |
                    | grocy, anylist)  |
                    +--------+---------+
                             |
                    WebSocket API + REST API
                             |
                             v
                    +------------------+
                    |  Beacon (React)   |
                    |                  |
                    |  useHomeAssistant |
                    |      |           |
                    |  +---+---+       |
                    |  |       |       |
                    |  Hooks   API     |
                    |  |       Clients |
                    |  v       |       |
                    |  Components      |
                    |      |           |
                    |  +---+---+       |
                    |  |       |       |
                    |  Views  Modals   |
                    |  |       |       |
                    +--+-------+-------+
                             |
                    localStorage (family, chores, theme)
```

### Component tree

```
App
  +-- Sidebar (navigation)
  |     +-- ThemeSelector
  +-- [activeView switch]
  |     +-- DashboardView
  |     |     +-- EventCard (x N)
  |     |     +-- TaskChecklist
  |     |     +-- CountdownWidget
  |     +-- WeekCalendar
  |     |     +-- EventBlock (x N)
  |     +-- MusicView
  |     +-- PhotoFrame
  |           +-- NowPlayingBar
  +-- EventModal (conditional)
  +-- FamilyManager (conditional)
  +-- ChoresPanel
  |     +-- ChoreCard (x N)
  |     +-- StreakBadge (x N)
  +-- Leaderboard
  |     +-- StreakBadge (x N)
  +-- NowPlayingBar (conditional)
  +-- Timer (slide panel)
  +-- ScreenSaver
```

---

## Adding a new theme

1. Create `src/styles/themes/mytheme.ts` implementing the `Theme` interface
2. Add the export and import in `src/styles/themes/index.ts`
3. Add it to the `themes` array in `index.ts`
4. Test: run `npm run dev`, open the theme selector, and verify your theme

See [Themes > Creating custom themes](/docs/themes/) for the complete `Theme` interface and guidelines.

---

## Adding a new sidebar view

1. **Define the view ID**: Add it to the `SidebarView` type in `src/components/Sidebar.tsx`:
   ```typescript
   export type SidebarView = 'dashboard' | 'calendar' | ... | 'myview';
   ```

2. **Add the nav item**: Add an entry to `NAV_ITEMS` in `Sidebar.tsx`:
   ```typescript
   { id: 'myview', icon: <MyIcon size={ICON_SIZE} />, label: 'My View' },
   ```

3. **Create the component**: Create `src/components/MyView.tsx` with your view content.

4. **Wire it in App.tsx**: Add a case in the `activeView` switch in `App.tsx`:
   ```typescript
   ) : activeView === 'myview' ? (
     <MyView ... />
   ) : (
   ```

5. **Add styles**: Create `src/styles/myview.css` and import it in `main.tsx` or your component.

---

## Adding a new integration

Example: Adding a new data source (e.g., a task manager).

1. **Define types**: Create `src/types/mytool.ts` with the data types.

2. **Create the API client**: Create `src/api/mytool.ts` that communicates with HA:
   ```typescript
   export class MyToolClient {
     private async haFetch(path: string): Promise<unknown> { ... }
     async getData(): Promise<MyData[]> { ... }
   }
   ```

3. **Create a hook**: Create `src/hooks/useMyTool.ts`:
   ```typescript
   export function useMyTool(connected: boolean): UseMyToolResult {
     const [data, setData] = useState([]);
     // Fetch on connect, refresh periodically
     return { data, loading, refresh };
   }
   ```

4. **Wire into App.tsx**: Import and use the hook, pass data to relevant components.

5. **Build the UI**: Create components that display and interact with the data.

---

## Testing locally

### Manual testing

1. Run `npm run dev`
2. Open `http://localhost:5173` in multiple browser windows to test different viewport sizes
3. Test these viewports:
   - 1280x800 (standard landscape tablet)
   - 1920x1080 (full HD monitor)
   - 1024x600 (small tablet)
   - 375x667 (mobile phone, portrait)

### With Home Assistant

1. Set up a development HA instance (HA Core in a venv, or HA OS in a VM)
2. Install the Google Calendar integration and/or Local Calendar
3. Create some test events
4. Point Beacon at the dev HA instance via `.env`

---

## PR review process

1. **Find or create an issue** before starting work
2. **Fork and branch**: `git checkout -b feature/my-feature`
3. **Follow the existing code style** (TypeScript, React functional components, hooks pattern)
4. **Test thoroughly** at multiple viewport sizes
5. **Update documentation** if your change affects user-facing behavior
6. **Submit the PR** with:
   - A link to the related issue
   - A description of what changed and why
   - Screenshots for visual changes
7. **Review**: A maintainer will review within a few days. Changes may be requested.

### Code style

- Use TypeScript strict mode
- React functional components with hooks (no class components)
- CSS custom properties for all colors (use `var(--*)` syntax)
- No external CSS frameworks
- Follow existing file naming patterns (PascalCase for components, camelCase for hooks/utils)

---

## What to contribute

- **Documentation**: Clearer explanations, more examples, screenshots
- **Accessibility**: Screen reader support, keyboard navigation, ARIA attributes
- **Localization**: Translations for greetings, labels, time formats
- **Calendar improvements**: Better CalDAV edge case handling, recurring event editing
- **Performance**: Faster rendering, smaller bundle size
- **New integrations**: Task managers, note apps, additional grocery services
- **Tests**: Unit tests for hooks and utilities

---

## Code of conduct

Be kind, be respectful, be constructive. We are building a family tool — let the community feel like one too.

---

## Thank you

Every contribution matters, from a one-line typo fix to a major feature. Thank you for helping make Beacon better for families everywhere.
