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
import { initNativeBridge } from './native';

// Initialize Capacitor native bridge (no-op on web)
initNativeBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
