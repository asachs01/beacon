/**
 * Capacitor native bridge — initializes native plugins when running
 * as an iOS/Android app. No-ops gracefully on web.
 */
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { App } from '@capacitor/app';

export function initNativeBridge() {
  if (!Capacitor.isNativePlatform()) return;

  // Hide splash screen after app loads
  SplashScreen.hide();

  // Configure status bar
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#faf9f6' }).catch(() => {});

  // iOS keyboard behavior: scroll input into view
  Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {});

  // Handle Android back button: go to dashboard or minimize
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.minimizeApp();
    }
  });
}

/** Returns true when running inside a Capacitor native shell */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Returns the current platform: 'ios', 'android', or 'web' */
export function getPlatform(): string {
  return Capacitor.getPlatform();
}
