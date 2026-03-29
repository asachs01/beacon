import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/beacon.css';
import './styles/family.css';
import './styles/dashboard.css';
import './styles/grocery.css';
import './styles/music.css';
import './styles/photos.css';
import './styles/screensaver.css';
import './styles/widgets.css';
import './styles/omni-add.css';
import './styles/settings.css';
import './styles/weather.css';
import { initNativeBridge } from './native';
import { applyStoredTheme } from './hooks/useTheme';

// Apply stored theme immediately (before first paint) to prevent flash
applyStoredTheme();

// Initialize Capacitor native bridge (no-op on web)
initNativeBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register service worker in production for offline PWA support
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // When a new SW is found, notify the user on next visit
      reg.onupdatefound = () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.onstatechange = () => {
          if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
            // New content available — will be used on next reload
            console.info('[Beacon] New version available. Refresh to update.');
          }
        };
      };
    }).catch((err) => {
      console.warn('[Beacon] SW registration failed:', err);
    });
  });
}
