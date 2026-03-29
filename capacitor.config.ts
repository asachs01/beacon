import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sachshaus.beacon',
  appName: 'Beacon',
  webDir: 'dist',
  server: {
    // In production, load from the local bundle.
    // For development, uncomment the url below to use live reload:
    // url: 'http://YOUR_LOCAL_IP:3000',
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#faf9f6',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#faf9f6',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'Beacon',
  },
  android: {
    backgroundColor: '#faf9f6',
  },
};

export default config;
