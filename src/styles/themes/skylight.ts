import type { Theme } from './index';

export const skylight: Theme = {
  id: 'skylight',
  name: 'Skylight',
  colors: {
    background: '#faf9f6',
    surface: '#ffffff',
    text: '#1a1a1a',
    textSecondary: '#6b7280',
    gridLines: '#e5e5e5',
    accent: '#3b82f6',
    headerBg: '#ffffff',
    todayHighlight: 'rgba(59, 130, 246, 0.04)',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
  },
  eventColors: [
    '#bfdbfe', // soft blue
    '#bbf7d0', // soft green
    '#ddd6fe', // soft purple
    '#fed7aa', // soft orange
    '#fbcfe8', // soft pink
    '#99f6e4', // soft teal
  ],
  fonts: {
    display: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  },
};
