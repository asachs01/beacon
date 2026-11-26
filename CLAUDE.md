# Beacon — Project Instructions

## Architecture

- React 19 + TypeScript + Vite SPA
- Home Assistant add-on with ingress support
- Capacitor for native iOS/Android builds

## Learnings - 2026-03-29

### Dual-Directory Structure
The only Home Assistant add-on manifest is `beacon/config.yaml`. It sets `image: ghcr.io/asachs01/beacon`, so Supervisor pulls the prebuilt image instead of building on the device. Do not add a second `config.yaml` / `config.yml` / `config.json` with `slug: beacon` anywhere else in the tree. Supervisor globs all of them, and a duplicate slug is last-write-wins.

Keep `init: false`. The runtime image is `ghcr.io/hassio-addons/base`, whose s6-overlay must be PID 1. There is no `build.yaml`; that file is deprecated. The base image is `ARG BUILD_FROM` in the Dockerfile, and the release publish passes it again as a build-arg.

After ANY source change, sync the add-on copy:
```bash
rsync -av --delete src/ beacon/src/
cp Dockerfile run.sh CHANGELOG.md beacon/
```

The published image is built from `beacon/` (`scripts/publish-addon-image.sh` and `build-addon.yml`). The root Dockerfile is kept identical so a root-context `docker build` still works. Anything that Dockerfile `COPY`s, including `custom_intents/` and `custom_sentences/`, must exist at the repo root as well:
```bash
rsync -av --delete beacon/custom_intents/ custom_intents/
rsync -av --delete beacon/custom_sentences/ custom_sentences/
```

### HA Add-on Auth: Long-Lived Token in Config
SUPERVISOR_TOKEN only works container-side (http://supervisor/core). postMessage auth doesn't work in HA companion app WKWebView. The `ha_token` config option (schema: password) is read into `HA_TOKEN` for the server proxy only. Do not put it, or `HA_BROWSER_TOKEN`, in `runtime-config.js`. The browser reaches Home Assistant through Beacon. Direct-port clients pair once; ingress (socket peer `172.30.32.2` in add-on mode) does not.

### HA Todo Items: Service Call with ?return_response
Don't read `entity.attributes.items` — it doesn't exist. Use:
```
POST /api/services/todo/get_items?return_response
Body: {"entity_id": "todo.xxx"}
Response: { service_response: { "todo.xxx": { items: [...] } } }
```
Filter out `unavailable` entities during discovery. Calling get_items on unavailable entities returns HTTP 500.

### HA Add-on Store Cache Busting
HA aggressively caches add-on repos. To force update visibility: create a git tag + GitHub release. If that fails, user must remove and re-add the repo URL. The `update_entity` service does NOT trigger a repo refresh.

### Semantic Release
`.releaserc.json` and `.github/workflows/release.yml` handle automated versioning. Uses conventional commits (`fix:` → patch, `feat:` → minor, `BREAKING CHANGE:` → major). The prepare step publishes the multi-arch GHCR image, and only then does `@semantic-release/git` commit the version bump in `beacon/config.yaml`. A failed image push leaves main unchanged.
