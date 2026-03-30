// Automation: 05 — Control Your Music (~30s)
// Playwright-style pseudocode for screen recording

const viewport = { width: 1920, height: 1080 };
const baseUrl = 'http://localhost:8099';

// Scene 1: Now Playing Bar (0s–10s)
navigate(baseUrl);
wait(2000); // dashboard loads, now playing bar visible at bottom
startRecording('05-now-playing');
// gentle zoom toward the now playing bar
wait(5000); // show album art, song title, artist
stopRecording();

// Scene 2: Playback Controls (10s–20s)
startRecording('05-controls');
click('.media-pause'); // pause playback
wait(1500);
click('.media-play'); // resume
wait(1500);
click('.media-next'); // skip to next track
wait(2000); // show track change
// adjust volume
dragSlider('.volume-slider', { from: 50, to: 80 });
wait(2000);
stopRecording();

// Scene 3: Player Selector (20s–30s)
startRecording('05-player-selector');
click('.player-selector'); // open player dropdown
wait(1500); // show available players
click('.player-option[data-player="kitchen"]'); // select kitchen speaker
wait(2000); // bar updates with new player
stopRecording();
