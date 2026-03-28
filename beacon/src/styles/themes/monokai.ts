import type { Theme } from './index';

export const monokai: Theme = {
  id: 'monokai',
  name: 'Monokai',
  colors: {
    background: '#272822',
    surface: '#3E3D32',
    text: '#F8F8F2',
    textSecondary: '#75715E',
    gridLines: '#3E3D32',
    accent: '#A6E22E',
    headerBg: '#3E3D32',
    todayHighlight: 'rgba(166, 226, 46, 0.06)',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
  },
  eventColors: [
    '#66D9EF', // blue
    '#A6E22E', // green
    '#AE81FF', // purple
    '#FD971F', // orange
    '#F92672', // pink/magenta
    '#E6DB74', // yellow
  ],
  fonts: {
    display: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  },
};
