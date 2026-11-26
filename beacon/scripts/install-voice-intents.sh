#!/usr/bin/env bash
# install-voice-intents.sh
#
# Copies Beacon custom sentences and intent handlers into the HA config
# directory so that HA Assist can recognize Beacon voice commands.
# When configuration.yaml has no top-level rest_command key, appends
# `rest_command: !include beacon_rest_command.yaml`. When it has no
# top-level intent_script key, appends
# `intent_script: !include_dir_merge_named custom_intents`.
# One timestamped backup is taken per run, before either edit.
# If a rest_command key or that include is already present, that part of
# the file is left unchanged and the lines to merge by hand are printed.
# If a top-level intent_script key is already present, that part is left
# unchanged and the intent_script line is printed to merge by hand.
#
# Usage:
#   ./install-voice-intents.sh                  # auto-detect HA config dir
#   ./install-voice-intents.sh /config          # specify HA config dir
#   ./install-voice-intents.sh --dry-run /config
#
# After running, restart Home Assistant. Reloading Conversation is not
# enough for a new rest_command.

set -euo pipefail

DRY_RUN=0
HA_CONFIG=""

usage() {
  cat <<'EOF'
Usage: install-voice-intents.sh [--dry-run] [HA_CONFIG_DIR]

Copies Beacon voice sentences, intents, and beacon_rest_command.yaml into
the Home Assistant config directory. Appends

  rest_command: !include beacon_rest_command.yaml

when configuration.yaml has no top-level rest_command key, and

  intent_script: !include_dir_merge_named custom_intents

when it has no top-level intent_script key. One timestamped backup of
configuration.yaml is written per run, before those edits.
If a top-level rest_command key or that include already exists, prints
the exact lines to merge by hand and does not change that part of the file.
If a top-level intent_script key already exists, prints that include line
to merge by hand and does not change that part of the file.

--dry-run   Print the plan. Do not copy files, edit configuration.yaml,
            or run ha core check.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      ;;
    -*)
      echo "ERROR: Unknown option: $arg" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [ -n "$HA_CONFIG" ]; then
        echo "ERROR: Unexpected extra argument: $arg" >&2
        usage >&2
        exit 1
      fi
      HA_CONFIG="$arg"
      ;;
  esac
done

# ── Locate HA config directory ──────────────────────────────────
if [ -z "$HA_CONFIG" ]; then
  if [ -d "/config" ]; then
    HA_CONFIG="/config"
  elif [ -d "/homeassistant" ]; then
    HA_CONFIG="/homeassistant"
  elif [ -d "$HOME/.homeassistant" ]; then
    HA_CONFIG="$HOME/.homeassistant"
  else
    echo "ERROR: Could not find Home Assistant config directory."
    echo "Usage: $0 [--dry-run] /path/to/ha/config"
    exit 1
  fi
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run. No files will be written."
fi
echo "Using HA config directory: $HA_CONFIG"

# ── Locate source files ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ADDON_DIR="$(dirname "$SCRIPT_DIR")"

SENTENCES_SRC="$ADDON_DIR/custom_sentences/en/beacon.yaml"
INTENTS_SRC="$ADDON_DIR/custom_intents/beacon.yaml"
REST_SRC="$ADDON_DIR/custom_intents/beacon_rest_command.yaml"

if [ ! -f "$SENTENCES_SRC" ]; then
  echo "ERROR: Custom sentences not found at $SENTENCES_SRC"
  exit 1
fi

if [ ! -f "$INTENTS_SRC" ]; then
  echo "ERROR: Custom intents not found at $INTENTS_SRC"
  exit 1
fi

if [ ! -f "$REST_SRC" ]; then
  echo "ERROR: rest_command file not found at $REST_SRC"
  exit 1
fi

install_file() {
  local src="$1"
  local dest="$2"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "Would install: $dest"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  echo "Installed: $dest"
}

# ── Install custom sentences ────────────────────────────────────
install_file "$SENTENCES_SRC" "$HA_CONFIG/custom_sentences/en/beacon.yaml"

# ── Install custom intents ──────────────────────────────────────
install_file "$INTENTS_SRC" "$HA_CONFIG/custom_intents/beacon.yaml"
install_file "$REST_SRC" "$HA_CONFIG/beacon_rest_command.yaml"

# Lines under the top-level rest_command key, copied exactly.
rest_command_merge_lines() {
  awk '
    /^rest_command:/ { found=1; next }
    found { print }
  ' "$REST_SRC"
}

REST_INCLUDE_LINE='rest_command: !include beacon_rest_command.yaml'
INTENT_SCRIPT_LINE='intent_script: !include_dir_merge_named custom_intents'

print_rest_manual_merge() {
  local reason="$1"
  echo "Left configuration.yaml unchanged for rest_command (${reason})."
  echo "Exact lines to merge by hand:"
  rest_command_merge_lines
}

print_intent_manual_merge() {
  echo "Left configuration.yaml unchanged for intent_script (a top-level intent_script: key already exists)."
  echo "Line to merge by hand:"
  echo "$INTENT_SCRIPT_LINE"
}

config_has_top_level_key() {
  local file="$1"
  local key="$2"
  [ -f "$file" ] || return 1
  grep -qE "^${key}[[:space:]]*:" "$file"
}

config_has_top_level_rest_command() {
  config_has_top_level_key "$1" "rest_command"
}

config_includes_beacon_rest() {
  local file="$1"
  [ -f "$file" ] || return 1
  # Non-comment include of this file, optionally quoted or prefixed with ./
  grep -qE '^[^#]*!include[[:space:]]+["'\'']?(\./)?beacon_rest_command\.yaml["'\'']?([[:space:]]|$)' "$file"
}

backup_configuration() {
  local file="$1"
  local stamp dest n
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  dest="${file}.bak.${stamp}"
  n=0
  while [ -e "$dest" ]; do
    n=$((n + 1))
    dest="${file}.bak.${stamp}-${n}"
  done
  cp -p "$file" "$dest"
  echo "Backed up configuration.yaml to ${dest}"
}

append_configuration_lines() {
  local file="$1"
  shift
  local line
  if [ "$#" -eq 0 ]; then
    return 0
  fi
  if [ ! -f "$file" ]; then
    : > "$file"
    echo "Created configuration.yaml"
  fi
  if [ -s "$file" ]; then
    local last
    last="$(tail -c 1 "$file" || true)"
    if [ -n "$last" ] && [ "$last" != $'\n' ]; then
      printf '\n' >> "$file"
    fi
    printf '\n' >> "$file"
  fi
  for line in "$@"; do
    printf '%s\n' "$line" >> "$file"
    echo "Appended to configuration.yaml: ${line}"
  done
}

wire_configuration() {
  local file="$HA_CONFIG/configuration.yaml"
  local -a to_append=()
  local line

  if config_includes_beacon_rest "$file"; then
    print_rest_manual_merge "beacon_rest_command.yaml is already included"
  elif config_has_top_level_rest_command "$file"; then
    print_rest_manual_merge "a top-level rest_command: key already exists"
  else
    to_append+=("$REST_INCLUDE_LINE")
  fi

  if config_has_top_level_key "$file" "intent_script"; then
    print_intent_manual_merge
  else
    to_append+=("$INTENT_SCRIPT_LINE")
  fi

  if [ "${#to_append[@]}" -eq 0 ]; then
    return 0
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    if [ "${#to_append[@]}" -eq 1 ]; then
      echo "Dry run: would append this line to ${file}:"
    else
      echo "Dry run: would append these lines to ${file}:"
    fi
    for line in "${to_append[@]}"; do
      echo "$line"
    done
    return 0
  fi

  # One backup covers every line appended in this run.
  if [ -f "$file" ]; then
    backup_configuration "$file"
  fi
  append_configuration_lines "$file" "${to_append[@]}"
}

wire_configuration

run_ha_core_check() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "ha core check: not run (--dry-run)"
    return 0
  fi
  if ! command -v ha >/dev/null 2>&1; then
    echo "ha core check: skipped (ha command not available)"
    return 0
  fi
  echo "Running ha core check..."
  local output status
  set +e
  output="$(ha core check 2>&1)"
  status=$?
  set -e
  if [ -n "$output" ]; then
    printf '%s\n' "$output"
  fi
  echo "ha core check exit code: ${status}"
}

run_ha_core_check

echo "Restart Home Assistant so rest_command and intent_script changes load. Reloading YAML is not enough for a new rest_command."

if [ "$DRY_RUN" -eq 1 ]; then
  exit 0
fi

# ── Print setup checklist ───────────────────────────────────────
cat <<'CHECKLIST'

  Beacon Voice Intents installed successfully.

  Before using, make sure you have:

  1. CHORE COMPLETION — "Mark dishes as done" completes a Beacon chore
     in FamilyStore. It does not update todo.chores.

     This script copies beacon_rest_command.yaml into the config
     directory. When configuration.yaml has no top-level rest_command
     key, it backs that file up once
     (configuration.yaml.bak.YYYYMMDD-HHMMSS) and appends:

       rest_command: !include beacon_rest_command.yaml

     When there is no top-level intent_script key, the same run appends
     this line in that same backup:

       intent_script: !include_dir_merge_named custom_intents

     If a rest_command key or that include is already there, that part
     of the file is left unchanged and the exact lines to merge are
     printed above. If an intent_script key is already there, that part
     is left unchanged and the intent_script line is printed above.
     Replace ADDON_SLUG with the slug in the add-on page URL
     (Settings → Add-ons → Beacon). The rest commands send
     Authorization: !secret beacon_token. The header Beacon receives
     is Authorization: Bearer <token>.
     Add-on: Beacon writes beacon_token into secrets.yaml on startup
     when that key is missing. Restart Home Assistant after the add-on
     is running.
     Standalone: add this to secrets.yaml BEFORE you restart Home
     Assistant, or Home Assistant will not load. Create the token under
     Settings → Devices → Create access token and copy it once:

       beacon_token: "Bearer <paste the token here>"
     The wall's hold-to-talk button can still complete chores through
     Beacon's own voice API if that command is missing.

  2. OTHER ENTITIES — These intents still use Home Assistant entities:
     - todo.grocery        Grocery / shopping list (add item, read list)
     - calendar.family     Family calendar (read today / tomorrow)
     - timer.beacon_voice  Timer helper (create in HA Helpers)

     "Check off …" marks a matching to-do item completed.
     "Uncheck …" marks it needs_action. Assist looks up the item by
     name across to-do lists. These are not Beacon chores.

     "What chores are left" reads Beacon's chore chart
     (GET /beacon-action/chores-left). It does not read todo.chores.

     If your entities have different names, edit the installed files:
       - Custom intents:   /config/custom_intents/beacon.yaml
       - Custom sentences: /config/custom_sentences/en/beacon.yaml

  3. TIMER HELPER — Create a Timer helper in HA:
     Settings > Devices & Services > Helpers > + Create Helper > Timer
     Name it "Beacon Voice" (entity_id: timer.beacon_voice)

  4. RELOAD — Restart Home Assistant after the script adds rest_command
     or intent_script. Sentence changes reload with
     Developer Tools > YAML > Conversation. A new rest_command does not
     load from a YAML reload.

  Voice commands available:
     "Add milk to the grocery list"
     "Check off milk"
     "Uncheck milk"
     "Mark dishes as done"
     "Alex finished vacuuming"
     "What's on the calendar today"
     "What's on the calendar tomorrow"
     "Show the dashboard"
     "Switch to the grocery view"
     "Set a timer for 5 minutes"
     "What's on the grocery list"
     "What chores are left"

CHECKLIST
