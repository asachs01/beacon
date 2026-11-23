#!/usr/bin/env bash
# install-voice-intents.sh
#
# Copies Beacon custom sentences and intent handlers into the HA config
# directory so that HA Assist can recognize Beacon voice commands.
#
# Usage:
#   ./install-voice-intents.sh              # auto-detect HA config dir
#   ./install-voice-intents.sh /config      # specify HA config dir
#
# After running, restart Home Assistant or reload the Conversation integration
# (Developer Tools > YAML > Conversation) for changes to take effect.

set -euo pipefail

# ── Locate HA config directory ──────────────────────────────────
HA_CONFIG="${1:-}"

if [ -z "$HA_CONFIG" ]; then
  # Try common locations
  if [ -d "/config" ]; then
    HA_CONFIG="/config"
  elif [ -d "/homeassistant" ]; then
    HA_CONFIG="/homeassistant"
  elif [ -d "$HOME/.homeassistant" ]; then
    HA_CONFIG="$HOME/.homeassistant"
  else
    echo "ERROR: Could not find Home Assistant config directory."
    echo "Usage: $0 /path/to/ha/config"
    exit 1
  fi
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

# ── Install custom sentences ────────────────────────────────────
SENTENCES_DEST="$HA_CONFIG/custom_sentences/en"
mkdir -p "$SENTENCES_DEST"
cp "$SENTENCES_SRC" "$SENTENCES_DEST/beacon.yaml"
echo "Installed: $SENTENCES_DEST/beacon.yaml"

# ── Install custom intents ──────────────────────────────────────
INTENTS_DEST="$HA_CONFIG/custom_intents"
mkdir -p "$INTENTS_DEST"
cp "$INTENTS_SRC" "$INTENTS_DEST/beacon.yaml"
echo "Installed: $INTENTS_DEST/beacon.yaml"

if [ -f "$REST_SRC" ]; then
  cp "$REST_SRC" "$HA_CONFIG/beacon_rest_command.yaml"
  echo "Installed: $HA_CONFIG/beacon_rest_command.yaml"
fi

# ── Print setup checklist ───────────────────────────────────────
cat <<'CHECKLIST'

  Beacon Voice Intents installed successfully.

  Before using, make sure you have:

  1. CHORE COMPLETION — "Mark dishes as done" completes a Beacon chore
     in FamilyStore. It does not update todo.chores.

     Copy the rest_command from beacon_rest_command.yaml into
     configuration.yaml. Replace ADDON_SLUG with the slug in the
     add-on page URL (Settings → Add-ons → Beacon), then restart
     Home Assistant. The wall's hold-to-talk button can still complete
     chores through Beacon's own voice API if that command is missing.

  2. OTHER ENTITIES — These intents still use Home Assistant entities:
     - todo.grocery        Grocery / shopping list (add item, read list)
     - calendar.family     Family calendar (read today / tomorrow)
     - timer.beacon_voice  Timer helper (create in HA Helpers)
     - todo.chores         Only "what chores are left" (BeaconChoreStatus).
                           Completing a chore does not use this list.

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
