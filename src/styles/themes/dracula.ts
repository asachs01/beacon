import type { Theme } from './index';

export const dracula: Theme = {
  id: 'dracula',
  name: 'Dracula',
  colors: {
    background: '#282A36',
    surface: '#44475A',
    text: '#F8F8F2',
    textSecondary: '#6272A4',
    gridLines: '#44475A',
    accent: '#BD93F9',
    headerBg: '#44475A',
    todayHighlight: 'rgba(189, 147, 249, 0.08)',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
  },
  eventColors: [
    '#8BE9FD', // cyan
    '#50FA7B', // green
    '#BD93F9', // purple
    '#FFB86C', // orange
    '#FF79C6', // pink
    '#F1FA8C', // yellow
  ],
  fonts: {
    display: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  },
};
