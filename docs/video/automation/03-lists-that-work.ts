// Automation: 03 — Lists That Actually Work (~40s)
// Playwright-style pseudocode for screen recording

const viewport = { width: 1920, height: 1080 };
const baseUrl = 'http://localhost:8099';

// Scene 1: Grocery List (0s–15s)
navigate(baseUrl);
wait(1000);
click('[data-nav="lists"]');
wait(2000); // let lists view load
startRecording('03-grocery-list');
// grocery list should be the default/first list
wait(5000); // show the list with items
stopRecording();

// Scene 2: Checking Off Items (15s–25s)
startRecording('03-check-items');
click('.todo-item:nth-child(2) .checkbox'); // check off an item
wait(1500);
click('.todo-item:nth-child(4) .checkbox'); // check off another
wait(1500);
// add a new item
click('.add-item-button');
wait(500);
type('.add-item-input', 'Avocados');
pressKey('Enter');
wait(2000); // show new item appearing
stopRecording();

// Scene 3: Switching Lists (25s–40s)
startRecording('03-switch-lists');
click('.list-selector'); // open list picker
wait(1000);
click('.list-option[data-list="packing"]'); // switch to packing list
wait(2000); // show different list with its own items
wait(3000); // hold on the new list
stopRecording();
