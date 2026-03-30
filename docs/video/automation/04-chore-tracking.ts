// Automation: 04 — Chore Tracking (~45s)
// Playwright-style pseudocode for screen recording

const viewport = { width: 1920, height: 1080 };
const baseUrl = 'http://localhost:8099';

// Scene 1: Family Members (0s–10s)
navigate(baseUrl);
wait(1000);
click('[data-nav="chores"]');
wait(2000);
startRecording('04-family-members');
wait(5000); // show family members with assigned chores
stopRecording();

// Scene 2: Checking Off Chores (10s–25s)
startRecording('04-check-chores');
click('.chore-item[data-chore="trash"] .checkbox'); // check off "take out trash"
wait(2000); // show check animation
// scroll to another family member
smoothScroll({ target: '.family-member[data-member="emma"]', duration: 1500 });
wait(3000); // show their chores, some already done
stopRecording();

// Scene 3: Leaderboard (25s–45s)
startRecording('04-leaderboard');
// scroll to or click leaderboard section
click('.chores-tab[data-tab="leaderboard"]');
wait(2000);
// show streaks, completion percentages
wait(5000); // hold on leaderboard
// highlight a streak badge
hover('.streak-badge[data-member="jake"]');
wait(3000);
stopRecording();
