// Automation: 08 — Works on Any Screen (~30s)
// Playwright-style pseudocode for screen recording

const baseUrl = 'http://localhost:8099';

// Scene 1: Desktop View (0s–10s)
setViewport({ width: 1920, height: 1080 });
navigate(baseUrl);
wait(2000);
startRecording('08-desktop');
wait(5000); // show full wide layout
stopRecording();

// Scene 2: Tablet View (10s–18s)
startRecording('08-tablet');
resizeViewport({ width: 1024, height: 768, duration: 1500 }); // animate resize
wait(2000); // layout adapts
wait(3000); // hold on tablet layout
stopRecording();

// Scene 3: Phone View (18s–30s)
startRecording('08-phone');
resizeViewport({ width: 390, height: 844, duration: 1500 }); // animate to phone size
wait(2000); // layout adapts to single column
// swipe between views
swipe({ direction: 'left', distance: 300, duration: 500 }); // swipe to next view
wait(2000);
swipe({ direction: 'left', distance: 300, duration: 500 }); // swipe again
wait(2000);
stopRecording();
