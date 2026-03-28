import type { Theme } from './index';

export const nord: Theme = {
  id: 'nord',
  name: 'Nord Ice',
  colors: {
    background: '#ECEFF4',
    surface: '#E5E9F0',
    text: '#2E3440',
    textSecondary: '#4C566A',
    gridLines: '#D8DEE9',
    accent: '#5E81AC',
    headerBg: '#E5E9F0',
    todayHighlight: 'rgba(94, 129, 172, 0.08)',
    shadow: '0 1px 3px rgba(46, 52, 64, 0.1)',
  },
  eventColors: [
    '#5E81AC', // nord blue (frost)
    '#A3BE8C', // nord green (aurora)
    '#B48EAD', // nord purple (aurora)
    '#D08770', // nord orange (aurora)
    '#BF616A', // nord red (aurora)
    '#88C0D0', // nord cyan (frost)
  ],
  fonts: {
    display: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  },
};
