/**
 * Video Featurette Recording Script
 *
 * Records Beacon app featurettes by capturing key-frame screenshots via
 * Chrome DevTools MCP and stitching them into video with FFmpeg.
 *
 * This script is executed step-by-step by Claude Code using Chrome DevTools
 * MCP tools. It serves as the authoritative automation sequence and
 * anonymization reference for each featurette.
 *
 * Output: docs/video/raw/01-meet-beacon.mp4, etc.
 *
 * Prerequisites:
 *   - Beacon app running at HA ingress URL
 *   - Chrome DevTools MCP connected to a browser with the app loaded
 *   - ffmpeg installed (brew install ffmpeg)
 *
 * Approach:
 *   1. Set viewport to 1920x1080 via mcp emulate
 *   2. Store anonymization function in window.__anonymize via evaluate_script
 *   3. For each featurette view, click nav buttons, call __anonymize(), screenshot
 *   4. Save key frames to docs/video/raw/.frames/XX-name/frame_NNNN.png
 *   5. Stitch with FFmpeg: 5 seconds per frame, crop HA sidebar (44px left)
 *
 * HA sidebar cropping: The HA parent page has a ~44px icon sidebar on the left
 * that cannot be reliably hidden via CSS (shadow DOM). FFmpeg crops it out:
 *   -vf "crop=iw-44:ih:44:0,scale=1920:1080"
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const CONFIG = {
  baseUrl: 'https://homeassistant.sachshaus.net/bc015843_beacon',
  viewport: { width: 1920, height: 1080 },
  secondsPerFrame: 5, // each key frame shows for 5 seconds in final video
  outputDir: 'docs/video/raw',
  framesDir: 'docs/video/raw/.frames',
  haSidebarCropPx: 44, // HA sidebar width to crop from left edge
};

// ---------------------------------------------------------------------------
// Demo Data Anonymization
// ---------------------------------------------------------------------------

/**
 * Anonymization function to inject into the page via evaluate_script.
 *
 * The Beacon iframe lives deep in HA's shadow DOM:
 *   document > home-assistant (shadowRoot)
 *     > home-assistant-main (shadowRoot)
 *       > ha-panel-app (shadowRoot)
 *         > iframe[title="Beacon"]
 *
 * IMPORTANT: Must be re-run after every navigation because React re-renders
 * the text nodes when switching views.
 *
 * Step 1: Store the function globally:
 *   evaluate_script(() => { window.__anonymize = () => { ... }; })
 *
 * Step 2: Call after each nav:
 *   evaluate_script(() => window.__anonymize())
 */
export const ANONYMIZE_SETUP_SCRIPT = `
() => {
  window.__anonymize = () => {
    const ha = document.querySelector('home-assistant');
    if (!ha || !ha.shadowRoot) return 0;
    const main = ha.shadowRoot.querySelector('home-assistant-main');
    if (!main || !main.shadowRoot) return 0;
    const panel = main.shadowRoot.querySelector('ha-panel-app');
    if (!panel || !panel.shadowRoot) return 0;
    const iframe = panel.shadowRoot.querySelector('iframe[title="Beacon"]');
    if (!iframe) return 0;
    const doc = iframe.contentDocument;
    if (!doc) return 0;

    const nameMap = {
      'Aaron': 'Dad', 'Ashley': 'Mom', 'ashley': 'mom',
      'Lennon': 'Emma', 'lennon': 'emma',
      'Eliette': 'Jake', 'eliette': 'jake',
      'Sachs Family': 'The Johnsons', 'Sachs': 'Johnson', 'sachs': 'johnson',
    };

    const eventMap = {
      "Stella's Vet Appointment": "Buddy's Vet Checkup",
      'WYRE Project Meeting': 'Team Standup',
      'WYRE/Chattanooga State Weekly Cadence Call': 'Weekly Planning',
      'WYRE/Lubing AI Lunch': 'Team Lunch',
      'Dadops': 'Project Review',
      'Blocking for Lunch': 'Lunch Break',
      'Blocking for Calls': 'Focus Time',
      'Blocking for Cal...': 'Focus Ti...',
      'Lunch and Learn Chattanooga State - Speaker Aaron Sachs': 'Lunch & Learn',
      'AI Office Hours': 'Office Hours',
      'Budget Information Meetings': 'Community Meeting',
      'Budget Information Facebook Live': 'Community Webinar',
      'Budget Informa...': 'Community Me...',
      "Aaron's proton calendar": "Dad's Calendar",
      "Ash and aaron's shared calendar": 'Family Shared',
      "ASH AND AARON'S SHARED CALENDAR": 'FAMILY SHARED CALENDAR',
      'Eliette and lennon childcare': 'Kids Activities',
      "Lennon's schedule": "Emma's Schedule",
      'Mission abbey: aaron sachs': 'Church Calendar',
      'Mission chattanooga sachs small group calendar': 'Small Group',
      'Hcs district website': 'School District',
      'HCS DISTRICT WEBSITE': 'SCHOOL DISTRICT',
      'Family cleaning calendar': 'Cleaning Schedule',
      'Budget (bills & income)': 'Budget',
      'BUDGET (BILLS & INCOME)': 'BUDGET',
      'Lennon Acro and Ballet': 'Emma Dance Class',
      'Lennon Acro an...': 'Emma Dance...',
      'Lennon Hip Hop': 'Emma Hip Hop',
      'CEC Closed - Spring Break': 'School Closed - Spring Break',
      'CEC Closed': 'School Closed',
      'Kindergarten Registation Opens': 'Kindergarten Registration',
      'Aaron Payday #1': 'Payday',
      'Ashley Payday': 'Payday #2',
      'Mission Donation': 'Monthly Donation',
      'Reconcile': 'Budget Review',
      'Anylist meal plan': 'Meal Planning',
      'ANYLIST MEAL PLAN': 'MEAL PLANNING',
      'Chicken Tikka Simmer Sauce & Zucchini': 'Chicken & Veggies',
      'Chicken Masala, mashed potatoes, gr...': 'Chicken Dinner',
      'Chicken Masala, mashed potatoes, green beans': 'Chicken Dinner & Sides',
      'Instant Pot Spaghetti': 'Pasta Night',
      'Easy Crockpot Carnitas': 'Slow Cooker Tacos',
      'Picnic Sandwiches or Pasta Salad': 'Picnic Lunch',
      'BLT for dinner': 'Sandwich Night',
      'Small group get together': 'Friends Gathering',
      'TECH FREE SUNDAY': 'FAMILY FUN SUNDAY',
      'Water the House Plants': 'Water Plants',
      'Maundy Thursday': 'Church Service',
      'Garbage Day': 'Trash Day',
      'Spring Holiday (No School)': 'Spring Break',
      'Spring Holiday': 'Spring Break',
      'Aaron, remember to take care of yourself and take a shower.': 'Evening Wind-Down',
    };

    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
    let node, count = 0;
    while ((node = walker.nextNode())) {
      let text = node.textContent;
      let changed = false;
      for (const [real, demo] of Object.entries(eventMap)) {
        if (text.includes(real)) { text = text.split(real).join(demo); changed = true; }
      }
      for (const [real, demo] of Object.entries(nameMap)) {
        if (text.includes(real)) { text = text.split(real).join(demo); changed = true; }
      }
      if (text.includes('[WYRE]')) { text = text.replace(/\\s*\\[WYRE\\]/g, ''); changed = true; }
      if (text.includes('WYRE')) { text = text.replace(/WYRE/g, 'Work'); changed = true; }
      if (changed) { node.textContent = text; count++; }
    }

    // Also anonymize input/textarea values (e.g., event detail modal)
    doc.querySelectorAll('input, textarea').forEach(el => {
      for (const [real, demo] of Object.entries(eventMap)) {
        if (el.value.includes(real)) el.value = el.value.split(real).join(demo);
      }
      for (const [real, demo] of Object.entries(nameMap)) {
        if (el.value.includes(real)) el.value = el.value.split(real).join(demo);
      }
    });

    return count;
  };

  return 'anonymize function stored';
}
`;

// ---------------------------------------------------------------------------
// FFmpeg Stitching Commands
// ---------------------------------------------------------------------------

/**
 * Stitch key-frame PNGs into an MP4 video.
 *
 * Each frame is displayed for CONFIG.secondsPerFrame seconds.
 * The HA sidebar (44px) is cropped from the left edge.
 * Output is 1920x1080 @ 30fps.
 */
export function ffmpegStitchCommand(featuretteId: string, name: string): string {
  const framesDir = `${CONFIG.framesDir}/${featuretteId}-${name}`;
  const output = `${CONFIG.outputDir}/${featuretteId}-${name}.mp4`;
  const crop = CONFIG.haSidebarCropPx;
  return [
    'ffmpeg -y',
    `-framerate 1/${CONFIG.secondsPerFrame}`,
    `-i ${framesDir}/frame_%04d.png`,
    '-c:v libx264 -pix_fmt yuv420p',
    `-vf "crop=iw-${crop}:ih:${crop}:0,scale=1920:1080,format=yuv420p"`,
    '-r 30',
    output,
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Featurette Sequences
// ---------------------------------------------------------------------------

/**
 * Beacon sidebar nav buttons (inside iframe, stable across navigations):
 *   Dashboard, Calendar, Chores, Lists, Tasks, Leaderboard,
 *   Music, Photos, Timer, Weather, Settings
 *
 * Use take_snapshot to get the current uid for each button, then click.
 */

export const FEATURETTES = {
  '01': {
    name: 'meet-beacon',
    title: 'Meet Beacon',
    description: 'Tour of all major views',
    frames: [
      'Dashboard (full view)',
      'Dashboard (scrolled)',
      'Calendar (week view, anonymized)',
      'Lists',
      'Weather',
      'Music',
      'Timer',
      'Chores + Leaderboard',
      'Dashboard (return, closing shot)',
    ],
  },

  '02': {
    name: 'family-calendar',
    title: 'Your Family Calendar',
    description: 'Calendar week view, filter pills, event detail modal',
    frames: [
      'Calendar (top of week, all-day events visible)',
      'Calendar (scrolled to afternoon, timed events)',
      'Calendar (Family filter pill toggled off)',
      'Calendar (all filters restored)',
      'Calendar (event detail modal open, anonymized)',
      'Calendar (modal dismissed)',
      'Calendar (scrolled back to top)',
    ],
  },

  '07': {
    name: 'multiple-timers',
    title: 'Kitchen Timers',
    description: 'Timer creation and multiple simultaneous timers',
    frames: [
      'Timer view (empty, ready to create)',
      'Timer (name "Pasta" typed, 10m selected)',
      'Timer (Pasta running at ~09:51)',
      'Timer (name "Garlic Bread" typed, 5m selected)',
      'Timer (both running: Pasta ~09:13, Garlic Bread ~04:53)',
      'Timer (both counting down, 3s later)',
      'Stopwatch tab',
      'Timer tab (both still running)',
    ],
  },
};

// ---------------------------------------------------------------------------
// Recording Procedure
// ---------------------------------------------------------------------------

/**
 * RECORDING PROCEDURE — Execute via Chrome DevTools MCP:
 *
 * 1. SETUP (once per session)
 *    mcp__chrome-devtools__emulate({ viewport: "1920x1080x1" })
 *    mcp__chrome-devtools__evaluate_script(ANONYMIZE_SETUP_SCRIPT)
 *
 * 2. FOR EACH FEATURETTE
 *    a. mkdir -p docs/video/raw/.frames/XX-name/
 *    b. For each frame in the featurette:
 *       - Click the appropriate nav button (use take_snapshot for uids)
 *       - evaluate_script(() => window.__anonymize())
 *       - take_screenshot({ filePath: ".../frame_NNNN.png" })
 *    c. Stitch: ffmpeg -y -framerate 1/5 -i frame_%04d.png \
 *         -c:v libx264 -pix_fmt yuv420p \
 *         -vf "crop=iw-44:ih:44:0,scale=1920:1080" \
 *         -r 30 output.mp4
 *    d. Cleanup: rm -rf docs/video/raw/.frames/XX-name/
 *
 * 3. VERIFY
 *    ffprobe -v quiet -show_entries format=duration output.mp4
 *    (should be ~N*5 seconds where N is frame count)
 */
