import type { Theme } from './index';

export const rose: Theme = {
  id: 'rose',
  name: 'Rose',
  colors: {
    background: '#fff1f2',
    surface: '#ffffff',
    text: '#4a2c2a',
    textSecondary: '#9b7a78',
    gridLines: '#fce7e8',
    accent: '#e11d48',
    headerBg: '#ffffff',
    todayHighlight: 'rgba(225, 29, 72, 0.05)',
    shadow: '0 1px 3px rgba(74, 44, 42, 0.08)',
  },
  eventColors: [
    '#fda4af', // rose
    '#c4b5fd', // lavender
    '#fdba74', // peach
    '#f9a8d4', // pink
    '#a5f3fc', // sky
    '#d9f99d', // lime
  ],
  fonts: {
    display: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  },
};
