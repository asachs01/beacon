import type { Theme } from './index';

export const midnightLight: Theme = {
  id: 'midnight-light',
  name: 'Midnight Light',
  colors: {
    background: '#1e293b',
    surface: '#334155',
    text: '#e2e8f0',
    textSecondary: '#a1b2c8',
    gridLines: '#475569',
    accent: '#f59e0b',
    headerBg: '#334155',
    todayHighlight: 'rgba(245, 158, 11, 0.08)',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
  },
  eventColors: [
    '#93bbfd', // pastel blue
    '#6ee7b7', // pastel green
    '#c4b5fd', // pastel purple
    '#fdba74', // pastel orange
    '#f9a8d4', // pastel pink
    '#5eead4', // pastel teal
  ],
  fonts: {
    display: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  },
};
