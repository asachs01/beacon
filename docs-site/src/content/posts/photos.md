---
title: "Photos"
date: 2026-03-26
description: "Turn Beacon into a digital photo frame — setting up photos, slideshow controls, clock overlay, and music integration."
categories: ["docs"]
tags: ["photos", "photo-frame", "slideshow", "media"]
slug: "photos"
draft: false
---

# Photos

Beacon can display your family photos as a digital photo frame with automatic slideshow, crossfade transitions, a clock/date overlay, and music controls layered on top.

---

## Setting up the photo directory

Beacon loads photos from Home Assistant's media browser. You need to place your photos in a directory that HA can access.

### Step 1: Create a photo directory

On your Home Assistant server, create a directory for photos:

```bash
mkdir -p /media/beacon/photos
```

If you are using Home Assistant OS, the `/media` directory is accessible through the Samba or SSH add-ons.

### Step 2: Add photos

Copy your family photos (JPEG, PNG) into the directory:

```bash
cp ~/family-photos/*.jpg /media/beacon/photos/
```

You can organize photos in subdirectories if you prefer — Beacon scans the configured directory for image files.

### Step 3: Configure the photo directory

Set the `photo_directory` option to point to your photos:

- **Add-on**: Configuration tab > `photo_directory: "/media/beacon/photos"`
- **Docker**: Environment variable `PHOTO_DIRECTORY=/media/beacon/photos`
- **Development**: `.env` file > `VITE_PHOTO_DIRECTORY=/media/beacon/photos`

### Step 4: Verify in Home Assistant

1. Go to **Media > Media Browser** in Home Assistant
2. Navigate to your photo directory
3. You should see your photos listed as thumbnails

---

## Adding photos through the HA media browser

You can also use Home Assistant's built-in media management:

1. In Home Assistant, go to **Media > Media Browser**
2. Navigate to the **Local Media** section
3. Upload photos using the upload button
4. These photos will be available to Beacon through the HA media API

---

## Photo frame mode

Open the photo view by clicking the **image icon** in the sidebar.

### What you see

- **Full-screen photo**: The current photo fills the entire view
- **Crossfade transition**: When the photo changes, a smooth crossfade animation plays
- **Clock overlay** (bottom): The current time, date, and optionally weather text
- **Music overlay** (bottom bar): If music is playing, the Now Playing bar appears over the photo

### Controls

The photo frame is tap-to-interact:

1. **Tap once** to show controls (previous, play/pause, next)
2. **Tap again** to hide controls
3. Controls auto-hide after 5 seconds of inactivity

When controls are visible:
- **Left arrow**: Previous photo
- **Play/Pause**: Toggle automatic slideshow cycling
- **Right arrow**: Next photo
- **Back arrow** (top left): Return to the previous view (dashboard)

### No photos available

If no photos are found, the view shows:
- "No photos available"
- A hint: "Add photos to your Home Assistant media directory"
- A back button to return to the dashboard

---

## Slideshow settings

### Interval

The slideshow auto-advances every N seconds. The default is **30 seconds**.

Configure it:
- **Add-on**: `photo_interval: 30` (value in seconds)
- **Docker**: `PHOTO_INTERVAL=30`
- **Development**: `VITE_PHOTO_INTERVAL=30`

### Transition

Photos transition with a **crossfade** effect. Each photo change increments a fade key that triggers a CSS animation on the image wrapper.

### Photo order

Photos are loaded from both the HA media browser API and the configured local directory, then **shuffled** randomly using the Fisher-Yates algorithm. The order changes each time the photo view is opened.

### Preloading

Beacon preloads the next photo in the background so transitions are smooth. When the current photo changes, an `Image()` object is created for the next photo in the queue, ensuring it is cached in the browser before it is displayed.

---

## Clock and weather overlay

When the controls are hidden, a gradient overlay appears at the bottom of the photo with:

- **Time**: Current time in localized format (e.g., "2:45 PM")
- **Date**: Full date (e.g., "Wednesday, March 28")
- **Weather** (optional): Weather text if configured

The clock updates every 30 seconds (not every second, to minimize UI updates during photo viewing).

The overlay is semi-transparent so it does not obscure the photo.

---

## Music overlay while viewing photos

If music is playing when you open the photo view, the Now Playing bar appears at the bottom of the photo frame. This gives you:

- Album art thumbnail
- Track title and artist
- Play/pause, skip forward, skip back controls
- Volume slider

The music overlay is always visible (it does not auto-hide with the photo controls).

---

## Photo sources

Beacon supports two photo sources, configured internally:

| Source | Description |
|--------|-------------|
| `ha_media` | Photos from HA's media browser root directory |
| `local` | Photos from the configured `photo_directory` path |

Both sources are enabled by default. Photos from both sources are combined and shuffled.

> **Note**: Google Photos integration (`google_photos` source) is defined in the type system but not yet implemented. It would require OAuth authentication.

---

## Troubleshooting

### "No photos available"

1. Verify photos exist in your configured directory on the HA server
2. Check that the `photo_directory` config option matches the actual path
3. Verify the HA media browser can see the photos: go to **Media > Media Browser** in HA
4. Check the browser console for "Failed to fetch" errors — this may indicate an authentication issue

### Photos load slowly or do not transition smoothly

1. Large photo files (10MB+) take time to download. Consider resizing photos to 1920x1080 or smaller.
2. Beacon preloads the next photo, but on slow networks this may not complete before the interval expires.
3. Increase the `photo_interval` to give more time for preloading.

### Clock overlay does not appear

The clock overlay only appears when `showClock` is true (it is true by default) and controls are hidden. Tap the photo to hide controls, and the overlay should appear.

### Music controls do not appear on photos

The music overlay requires:
1. An active media player in the `playing` state
2. The music hooks (play, pause, next, previous, volume) must be available

If no media player is playing, the music bar will not appear.
