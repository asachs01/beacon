/**
 * Optional native screen brightness.
 *
 * Beacon does not ship a brightness plugin. On a Capacitor build that already
 * registers `ScreenBrightness` (the @capacitor-community/screen-brightness
 * shape: `setBrightness({ brightness })` from 0 to 1, and -1 to restore the
 * system brightness), night mode uses it. Otherwise this is a no-op.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

const PLUGIN_NAME = 'ScreenBrightness';

interface ScreenBrightnessPlugin {
  setBrightness(options: { brightness: number }): Promise<void>;
}

export async function applyNativeNightBrightness(percent: number | null): Promise<'applied' | 'unavailable'> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable(PLUGIN_NAME)) {
    return 'unavailable';
  }
  try {
    const plugin = registerPlugin<ScreenBrightnessPlugin>(PLUGIN_NAME);
    if (percent == null || !Number.isFinite(percent)) {
      await plugin.setBrightness({ brightness: -1 });
    } else {
      const brightness = Math.min(1, Math.max(0, percent / 100));
      await plugin.setBrightness({ brightness });
    }
    return 'applied';
  } catch {
    return 'unavailable';
  }
}
