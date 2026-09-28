// Automation: 10 — Install in 2 Minutes (~30s)
// Playwright-style pseudocode for screen recording
//
// NOTE: This records the Home Assistant UI, not the Beacon app itself.
// Requires a running HA instance accessible via browser.

const viewport = { width: 1920, height: 1080 };
const haUrl = 'http://homeassistant.local:8123';
const parentPin = process.env.BEACON_PARENT_PIN;
const allowedEntities = process.env.BEACON_ALLOWED_ENTITIES;
if (!parentPin || !/^\d{6,8}$/.test(parentPin) || !allowedEntities) {
  throw new Error('Set BEACON_PARENT_PIN and BEACON_ALLOWED_ENTITIES before recording');
}

// Scene 1: Add Repository (0s–10s)
navigate(`${haUrl}/hassio/store`);
wait(2000); // add-on store loads
startRecording('10-add-repo');
click('.menu-button'); // three-dot menu
wait(500);
click('[data-option="repositories"]');
wait(1000);
type('.repository-input', 'https://github.com/f1f1f1f1f1f1/Family');
click('.add-repository-button');
wait(3000); // repository loads
click('.dialog-close');
wait(1000);
stopRecording();

// Scene 2: Install Add-on (10s–20s)
startRecording('10-install');
click('.addon-card[data-addon="family"]'); // find Family in the list
wait(1000);
click('.install-button');
wait(5000); // install progress (speed up in post-production)
click('.configuration-tab');
type('.parent-pin-input', parentPin);
type('.allowed-entities-input', allowedEntities);
click('.save-button');
click('.info-tab');
click('.start-button');
wait(2000); // add-on starts
stopRecording();

// Scene 3: Open and Done (20s–30s)
startRecording('10-open');
click('.open-webui-button'); // Open Web UI
wait(3000); // Beacon dashboard loads with HA data
wait(5000); // hold on the populated dashboard
stopRecording();
