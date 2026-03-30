// Automation: 09 — Voice & AI Control (~40s)
// Playwright-style pseudocode for screen recording
//
// NOTE: This featurette requires mixed recording — some automated browser
// captures and some manual screen recordings of voice/AI interactions.

const viewport = { width: 1920, height: 1080 };
const baseUrl = 'http://localhost:8099';

// Scene 1: Voice Commands (0s–15s)
// MANUAL RECORDING: Show HA Assist voice interaction
// Record a screen capture of:
//   - Opening HA Assist (voice satellite or app)
//   - Saying "What's on the calendar today?"
//   - HA responding with today's schedule
// Save as: 09-voice-commands-manual.mp4

// Scene 2: AI Agent Tools (15s–30s)
// Split-screen setup: terminal/chat on left, Beacon dashboard on right
navigate(baseUrl);
wait(2000);
startRecording('09-ai-tools-dashboard');
// dashboard side — show it updating when AI adds an item
wait(15000); // hold while the AI interaction plays on the left side
stopRecording();

// MANUAL RECORDING for left side:
// Record a terminal showing an LLM agent using MCP tools:
//   - "Add milk to the grocery list"
//   - Tool call executes, item appears on dashboard
// Save as: 09-ai-tools-terminal.mp4

// Scene 3: Natural Language (30s–40s)
// MANUAL RECORDING: Show one more AI query
// "What chores does Emma have left today?"
// Natural language response listing remaining chores
// Save as: 09-natural-language-manual.mp4
