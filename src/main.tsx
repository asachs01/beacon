import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/beacon.css';
import './styles/family.css';
import './styles/dashboard.css';
import './styles/music.css';
import './styles/photos.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
