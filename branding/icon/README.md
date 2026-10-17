# Beacon Icon Set

This directory contains the source artwork and build tools for Beacon's icon set.

## Regenerating Icons

The icon set is generated from a single SVG source with the Inter font for text elements. To regenerate all icons:

1. **Download the Inter Variable Font** from Google Fonts:
   ```bash
   curl -L -o Inter.ttf "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
   ```
   
   Note: The font file is not committed to the repository. Download it each time you need to rebuild.

2. **Install Python dependencies**:
   ```bash
   pip install cairosvg pillow fonttools
   ```

3. **Run the build script**:
   ```bash
   INTER_TTF=Inter.ttf python3 scripts/build-icons.py
   ```
   
   This will:
   - Generate SVG source files with text converted to paths in `branding/icon/svg/`
   - Export PNG assets for all platforms in `branding/icon/export/`
   - Automatically copy all files to their repository destinations per `manifest.json`

## Generated Assets

- **Web**: App icons (16-512px), maskable icons, favicon, OG image
- **Home Assistant**: Add-on icon (128x128) and logo (250x100)
- **Android**: All density buckets (mdpi through xxxhdpi) for launcher icons
- **iOS**: 1024x1024 opaque RGB app icon
- **Docs**: Favicon for the documentation site

## Source Files

- `svg/*.svg` - SVG source files with text converted to paths
- `export/` - Rasterized PNG exports (not committed to repo)
- `manifest.json` - Maps generated files to their repository paths

## Platform Notes

- **Android**: Background color is set to `#101d3c` in `values/ic_launcher_background.xml`
- **iOS**: Icon must be opaque RGB (no alpha channel) per Apple requirements
- **Web**: Includes both standard and maskable icons for PWA support
