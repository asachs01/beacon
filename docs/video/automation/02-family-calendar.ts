// Automation: 02 — Your Family's Calendar (~45s)
// Playwright-style pseudocode for screen recording

const viewport = { width: 1920, height: 1080 };
const baseUrl = 'http://localhost:8099';

// Scene 1: Week View (0s–15s)
navigate(baseUrl);
wait(1000);
click('[data-nav="calendar"]'); // navigate to calendar view
wait(2000); // let calendar render
startRecording('02-week-view');
wait(5000); // show full week view with color-coded events
// slow pan across the week
smoothScroll({ direction: 'right', distance: 200, duration: 5000 });
wait(3000);
stopRecording();

// Scene 2: Weather + Filters (15s–35s)
startRecording('02-weather-filters');
// highlight weather icons in day headers
hover('.calendar-day-header .weather-icon');
wait(3000);
// tap a filter pill to isolate one calendar
click('.filter-pill[data-calendar="mom"]');
wait(3000); // show filtered view
click('.filter-pill[data-calendar="mom"]'); // toggle back
wait(3000); // show all calendars restored
stopRecording();

// Scene 3: Event Detail (35s–45s)
startRecording('02-event-detail');
click('.calendar-event[data-event="soccer"]'); // tap an event
wait(1000); // detail panel slides in
wait(5000); // hold on event detail
click('.event-detail-close'); // dismiss
wait(2000);
stopRecording();
