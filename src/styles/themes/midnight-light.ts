import type { Theme } from './index';

export const midnightLight: Theme = {
  id: 'midnight-light',
  name: 'Beacon Light',
  colors: {
    background: '#f8fafc',
    surface: '#f1f5f9',
    text: '#0f172a',
    textSecondary: '#64748b',
    gridLines: '#e2e8f0',
    accent: '#f59e0b',
    headerBg: '#f1f5f9',
    todayHighlight: 'rgba(245, 158, 11, 0.06)',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
  },
  eventColors: [
    '#bfdbfe', // blue
    '#bbf7d0', // green
    '#ddd6fe', // purple
    '#fed7aa', // orange
    '#fbcfe8', // pink
    '#99f6e4', // teal
  ],
  fonts: {
    display: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  },
};
