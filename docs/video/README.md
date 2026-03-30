# Beacon Video Featurette Series — Production Guide

## Overview

A series of 10 short video featurettes (30–45 seconds each) showcasing Beacon's features. Each video pairs an AI-cloned voiceover with automated screen recordings of the actual app.

**Total runtime:** ~6 minutes across all featurettes.

## Pipeline

```
Script (markdown) → Screen Recording (Playwright) → Voiceover (ElevenLabs) → Compositing (FFmpeg) → Final Cut
```

### Step-by-step

1. **Write/refine script** — Each featurette has a script in `scripts/` with narration, scene descriptions, and timing.
2. **Record screen footage** — Use Playwright automation (pseudocode in `automation/`) to drive a browser through the app, capturing consistent recordings.
3. **Generate voiceover** — Feed the `Voice:` sections from each script into ElevenLabs with a cloned voice profile.
4. **Composite** — Layer voice audio over screen recordings using FFmpeg. Add transitions, title cards, and the Beacon logo.
5. **Export** — Render final MP4s at 1080p for YouTube/social, plus 720p vertical crops for Instagram/TikTok.

## Tools Required

| Tool | Purpose | Notes |
|------|---------|-------|
| **Playwright** | Browser automation for screen recordings | `npx playwright` — headless or headed |
| **ElevenLabs** | AI voice cloning + text-to-speech | Professional Voice Clone plan recommended |
| **FFmpeg** | Video compositing, transitions, encoding | `brew install ffmpeg` |
| **Beacon (running)** | The app itself, populated with demo data | Use the demo/standalone mode |
| **OBS Studio** (optional) | Manual screen recording backup | If Playwright capture has issues |

## ElevenLabs Setup

1. Create an account at [elevenlabs.io](https://elevenlabs.io)
2. Clone a voice using the Professional Voice Clone feature (requires ~30 minutes of sample audio)
3. Alternatively, use a pre-made voice from the Voice Library — look for warm, conversational American English voices
4. Set stability to ~0.5 and clarity to ~0.75 for natural-sounding narration
5. Export each clip as 44.1kHz WAV for maximum quality during compositing

## Demo Data Requirements

Before recording, the Beacon instance needs realistic demo data:

- **Calendar:** 5–7 events across the current week (school, soccer, dentist, date night, etc.)
- **Lists:** A grocery list with 8–10 items, a household list, a packing list
- **Chores:** 3–4 family members with assigned chores, some completed, streak data
- **Media:** A media player entity with a recognizable song playing
- **Weather:** Real weather data (or mocked forecast with varied conditions)
- **Timers:** Ability to create named timers on the fly

## Screen Recording Settings

- **Resolution:** 1920x1080 (desktop), 1024x768 (tablet), 390x844 (phone)
- **Frame rate:** 30fps
- **Browser:** Chromium via Playwright
- **Viewport:** Match resolution above, no browser chrome
- **Mouse cursor:** Hidden for clean recordings
- **Animations:** Ensure CSS transitions are enabled (no `prefers-reduced-motion`)

## File Naming Convention

```
beacon-01-meet-beacon-1080p.mp4
beacon-01-meet-beacon-voice.wav
beacon-01-meet-beacon-final.mp4
```

## Compositing with FFmpeg

Basic overlay of voice on screen recording:

```bash
ffmpeg -i screen.mp4 -i voice.wav \
  -c:v copy -c:a aac -b:a 192k \
  -map 0:v:0 -map 1:a:0 \
  output.mp4
```

Add a fade-in/fade-out:

```bash
ffmpeg -i input.mp4 \
  -vf "fade=t=in:st=0:d=0.5,fade=t=out:st=44:d=1" \
  -af "afade=t=in:st=0:d=0.5,afade=t=out:st=44:d=1" \
  output.mp4
```

## Featurette Index

| # | Script | Duration | Topic |
|---|--------|----------|-------|
| 01 | `scripts/01-meet-beacon.md` | ~45s | Introduction |
| 02 | `scripts/02-family-calendar.md` | ~45s | Calendar |
| 03 | `scripts/03-lists-that-work.md` | ~40s | Lists |
| 04 | `scripts/04-chore-tracking.md` | ~45s | Chores |
| 05 | `scripts/05-music-control.md` | ~30s | Media player |
| 06 | `scripts/06-weather-forecast.md` | ~40s | Weather |
| 07 | `scripts/07-multiple-timers.md` | ~35s | Timers |
| 08 | `scripts/08-any-screen.md` | ~30s | Responsive design |
| 09 | `scripts/09-voice-ai.md` | ~40s | Voice + AI |
| 10 | `scripts/10-install.md` | ~30s | Installation |
