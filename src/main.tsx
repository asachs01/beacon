import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/beacon.css';
import './styles/family.css';
import './styles/dashboard.css';
import './styles/grocery.css';
import './styles/now-playing.css';
import './styles/screensaver.css';
import './styles/omni-add.css';
import './styles/settings-buttons.css';
// On-demand screens import their own stylesheets (settings.css, music.css,
// photos.css, weather.css, timer.css, focus.css), so those download with the screen.
import { initNativeBridge } from './native';
import { applyStoredTheme } from './hooks/useTheme';
import { applyStoredFontScale } from './utils/font-scale';
import { applySavedLogin } from './hooks/useHaAuth';

// Apply stored theme and text size immediately (before first paint) to prevent flash
applyStoredTheme();
applyStoredFontScale();

// Initialize Capacitor native bridge (no-op on web)
initNativeBridge();

// The HA client and REST calls read the login from the config, so the one
// saved by onboarding goes there before anything renders.
applySavedLogin()
  .catch((err) => console.error('Beacon: could not read the saved Home Assistant login', err))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
