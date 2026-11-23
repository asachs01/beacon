#!/usr/bin/env bash
# install-voice-intents.sh
#
# Copies Beacon custom sentences and intent handlers into the HA config
# directory so that HA Assist can recognize Beacon voice commands.
# When configuration.yaml has no top-level rest_command key, appends
# `rest_command: !include beacon_rest_command.yaml` after a timestamped
# backup. If a rest_command key or that include is already present, the
# file is left unchanged and the lines to merge by hand are printed.
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

to configuration.yaml when that file has no top-level rest_command key.
Backs up configuration.yaml with a timestamp before editing it.
If a top-level rest_command key or that include already exists, prints
the exact lines to merge by hand and does not edit configuration.yaml.

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

print_manual_merge() {
  local reason="$1"
  echo "Left configuration.yaml unchanged (${reason})."
  echo "Exact lines to merge by hand:"
  rest_command_merge_lines
}

config_has_top_level_rest_command() {
  local file="$1"
  [ -f "$file" ] || return 1
  grep -qE '^rest_command[[:space:]]*:' "$file"
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

append_rest_include() {
  local file="$1"
  local line="rest_command: !include beacon_rest_command.yaml"
  if [ ! -f "$file" ]; then
    printf '%s\n' "$line" > "$file"
    echo "Created configuration.yaml"
    echo "Appended to configuration.yaml: ${line}"
    return 0
  fi
  if [ -s "$file" ]; then
    local last
    last="$(tail -c 1 "$file" || true)"
    if [ "$last" != "" ] && [ "$last" != $'\n' ]; then
      printf '\n' >> "$file"
    fi
    printf '\n%s\n' "$line" >> "$file"
  else
    printf '%s\n' "$line" >> "$file"
  fi
  echo "Appended to configuration.yaml: ${line}"
}

wire_rest_command() {
  local file="$HA_CONFIG/configuration.yaml"
  local line="rest_command: !include beacon_rest_command.yaml"

  if config_includes_beacon_rest "$file"; then
    print_manual_merge "beacon_rest_command.yaml is already included"
    return 0
  fi

  if config_has_top_level_rest_command "$file"; then
    print_manual_merge "a top-level rest_command: key already exists"
    return 0
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "Dry run: would append this line to ${file}:"
    echo "$line"
    return 0
  fi

  if [ -f "$file" ]; then
    backup_configuration "$file"
  fi
  append_rest_include "$file"
}

wire_rest_command

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

echo "Restart Home Assistant so rest_command changes load. Reloading YAML is not enough for a new rest_command."

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
     key, it backs that file up (configuration.yaml.bak.YYYYMMDD-HHMMSS)
     and appends:

       rest_command: !include beacon_rest_command.yaml

     If a rest_command key or that include is already there, the file
     is left unchanged and the exact lines to merge are printed above.
     Replace ADDON_SLUG with the slug in the add-on page URL
     (Settings → Add-ons → Beacon), then restart Home Assistant.
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

  4. RELOAD — Restart Home Assistant after adding the rest_command.
     Sentence changes reload with Developer Tools > YAML > Conversation.
     Also include the intent file if it is not already loaded:

       intent_script: !include_dir_merge_named custom_intents

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
