import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/beacon.css';
import './styles/family.css';
import './styles/dashboard.css';
import './styles/grocery.css';
import './styles/meals.css';
import './styles/music.css';
import './styles/photos.css';
import './styles/screensaver.css';
import './styles/night-mode.css';
import './styles/widgets.css';
import './styles/omni-add.css';
import './styles/voice-assist.css';
import './styles/magic-import.css';
import './styles/settings.css';
import './styles/weather.css';
import './styles/focus.css';
import { initNativeBridge } from './native';
import { applyStoredTheme } from './hooks/useTheme';
import { bootstrapStoredFonts } from './fonts/apply';
import { installDemo } from './demo/install';

// Demo builds seed fixtures before the first paint so screenshots are stable.
if (import.meta.env.VITE_DEMO === 'true') {
  installDemo();
}

// Apply stored theme and fonts immediately (before first paint) to prevent flash
applyStoredTheme();
bootstrapStoredFonts();

// Initialize Capacitor native bridge (no-op on web)
initNativeBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
