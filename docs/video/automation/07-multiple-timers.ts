// Automation: 07 — Kitchen Timers (~35s)
// Playwright-style pseudocode for screen recording

const viewport = { width: 1920, height: 1080 };
const baseUrl = 'http://localhost:8099';

// Scene 1: Creating a Timer (0s–12s)
navigate(baseUrl);
wait(1000);
click('[data-nav="timers"]');
wait(1000);
startRecording('07-create-timer');
click('.add-timer-button');
wait(500);
type('.timer-name-input', 'Pasta');
click('.timer-duration-input');
type('.timer-duration-input', '10:00');
click('.timer-start-button');
wait(3000); // show timer counting down
stopRecording();

// Scene 2: Multiple Timers Running (12s–25s)
startRecording('07-multiple-timers');
click('.add-timer-button');
wait(500);
type('.timer-name-input', 'Garlic Bread');
click('.timer-duration-input');
type('.timer-duration-input', '8:00');
click('.timer-start-button');
wait(2000); // both timers now visible
wait(5000); // hold showing both counting down simultaneously
stopRecording();

// Scene 3: Timer Goes Off (25s–35s)
startRecording('07-timer-alert');
// fast-forward or wait for a timer to complete (in demo, use a short timer)
wait(3000); // timer alert fires
click('.timer-dismiss'); // dismiss the alert
wait(2000); // other timer still running
stopRecording();
