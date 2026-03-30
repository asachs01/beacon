import type { Theme } from './index';

export const midnight: Theme = {
  id: 'midnight',
  name: 'Beacon Dark',
  colors: {
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f8fafc',
    textSecondary: '#94a3b8',
    gridLines: '#334155',
    accent: '#f59e0b',
    headerBg: '#1e293b',
    todayHighlight: 'rgba(245, 158, 11, 0.06)',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
  },
  eventColors: [
    '#60a5fa', // bright blue
    '#34d399', // bright green
    '#a78bfa', // bright purple
    '#fb923c', // bright orange
    '#f472b6', // bright pink
    '#2dd4bf', // bright teal
  ],
  fonts: {
    display: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  },
};
