# Beacon — Project Instructions

## Architecture

- React 19 + TypeScript + Vite SPA
- Home Assistant add-on with ingress support
- Capacitor for native iOS/Android builds

## Learnings - 2026-03-29

### Single Add-on at Repo Root (this fork)
This fork (add-on slug `family`) is built by Supervisor from the repo root:
root `config.yaml` has no `image:` line, so the root `Dockerfile` builds
from `src/`, `server.js`, `run.sh` etc. at the root. The Supervisor only
rebuilds when `version` in `config.yaml` changes; semantic-release sets it
on every release, so don't bump it by hand (see Release Versions Only Go Up).
With no `build.yaml`, the Supervisor passes no `BUILD_FROM`, so the
Dockerfile's own default base image is what installs use. Nothing publishes
an image; CI's `docker` job builds it (amd64, not pushed) on every PR.

Upstream's `beacon/` subdirectory was removed: Supervisor treats every
`config.yaml` in a repository as a separate add-on, so it showed up in the
add-on store as a stale second "Beacon" add-on. Don't reintroduce a nested
`config.yaml`.

### HA Add-on Auth: Server-Side Proxy, No Browser Token
In the add-on the browser never holds an HA token. SUPERVISOR_TOKEN only
works container-side (http://supervisor/core), so server.js proxies
/api/* and the /beacon-action/* bridges with it, and the page calls them
same-origin through ingress (run.sh writes an empty `ha_token` into
runtime-config.js). postMessage auth doesn't work in the HA companion
app's WKWebView. There is no `ha_token` add-on option.

### HA Todo Items: Service Call with ?return_response
Don't read `entity.attributes.items` — it doesn't exist. Use:
```
POST /api/services/todo/get_items?return_response
Body: {"entity_id": "todo.xxx"}
Response: { service_response: { "todo.xxx": { items: [...] } } }
```
Filter out `unavailable` entities during discovery. Calling get_items on unavailable entities returns HTTP 500.
Only services that return data take `?return_response`: HA answers 400 to
it on add_item, update_item and remove_item.

### HA Add-on Store Cache Busting
HA aggressively caches add-on repos. To force update visibility: create a git tag + GitHub release. If that fails, user must remove and re-add the repo URL. The `update_entity` service does NOT trigger a repo refresh.

### Semantic Release
`.releaserc.json` and `.github/workflows/release.yml` handle automated versioning. Uses conventional commits (`fix:`/`perf:` → patch, `feat:` → minor, `BREAKING CHANGE:` → major; other types don't release, so they reach displays only with the next release). Writes the version into config.yaml, prepends CHANGELOG.md (shown by HA as the add-on's changelog), creates GitHub releases.

## Learnings - 2026-09-26

### Google Tasks Chores Sync Runs in the Add-on Server
The sync lives in `chores-sync.cjs` (required by `server.js`), not in the
browser: one pass at a time, every 60s, ~5s after a write to the chores or
completions collection, and on POST `/beacon-action/chores-sync` (Sync Now;
GET returns status). `src/hooks/useChoresSync.ts` only polls that status and
refreshes screens when `lastChangeAt` moves. Server tests are root-level
`*.test.ts` files (vitest includes them). Any new server-side file needs its
own `COPY` line in the `Dockerfile` — only `server.js` and the files listed
there reach the container. Server-side files use `.cjs` because the root
`package.json` is `"type": "module"`.

### On-Demand Screens (code splitting)
Screens not needed to show the dashboard (Settings, Music, Photos, Weather,
Timer, Leaderboard, Onboarding, Kid Display, the Advanced Dashboard with
GridStack, and its dnd-kit classic-layout editor) are loaded with
`lazyNamed()` (src/utils/lazy-screen.ts) inside `<LazyBoundary>`. A plain
`import { X } from './X'` anywhere on the startup path pulls X (and its
libraries) back into the main bundle, so check `npm run build` output.
`manualChunks` in vite.config.ts only splits React out; don't widen it to
all of node_modules, or GridStack/dnd-kit end up in the startup download.
After an add-on update a running display asks for old file names and
server.js answers with index.html; `lazyNamed` reloads the page once.
Their stylesheets are imported by the screens themselves (settings.css,
music.css, photos.css, weather.css, timer.css, focus.css), not main.tsx, so they
download with the screen; glass.css, the frosted panels Music, Weather and
Timer share, is imported by each of the three. Rules something on the startup path needs stay
in a startup stylesheet (e.g. settings-buttons.css, now-playing.css).

### Release Versions Only Go Up
HA Core's update entity (Settings → Updates) offers an add-on update only
when the repo's version is higher than the installed one (AwesomeVersion
`>`). The Supervisor, which now calls add-ons "apps", only checks `!=`
(`need_update` in supervisor/apps/app.py), so its own page and auto-update
would follow a lower number. semantic-release numbers releases from the
highest `v*` tag reachable from main, never from config.yaml. This fork had
no v1.50.x tags, so its first run restarted at 1.0.0, and 1.0.0–1.1.2 never
reached installs on 1.50.x. That was fixed by a `chore(release): 1.51.5`
commit setting config.yaml to 1.51.5, tagged v1.51.5. Keep the wrong
v1.0.0–v1.1.2 tags: the highest tag wins, and CHANGELOG.md links to them.

`scripts/check-release-version.cjs` (`verifyReleaseCmd` in .releaserc.json)
stops a release numbered below config.yaml's version. If it fires: on main,
set config.yaml's version above both, commit it as `chore(release): X` (that
type doesn't release by itself), tag the commit `vX`, and push both together
with `git push --atomic origin main vX`.

### HA Calendar Events: Use `uid`, Not `id`
Every occurrence of a repeating HA event has the series' `uid` plus its own
`recurrence_id`, so `CalendarEvent.id` is `uid::recurrence_id` there — never
send `id` to HA. Update/delete take `event.uid ?? event.id` and, for an
occurrence, `occurrenceTarget()` (src/utils/calendar-edits.ts) for
`recurrence_id`/`recurrence_range`; without them HA changes the whole series.
`calendar/event/update` replaces the whole event and requires `summary`, so
send the full event (`formToPayload`/`movedPayload`), not just changed fields.

### Family Data Writes Fail Loudly
In add-on mode `addToCollection`/`updateInCollection`/`removeFromCollection`
throw `SaveFailedError` (and report it, for the "Couldn't save" notice) when
the server doesn't take a write. Don't fall back to writing localStorage:
the next read replaces that cache with the server's copy. Hooks wrap writes
in `saveThen()` (src/utils/save-errors.ts), which refreshes either way.
