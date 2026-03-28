import type { Theme } from './index';

export const forest: Theme = {
  id: 'forest',
  name: 'Forest',
  colors: {
    background: '#f5f5dc',
    surface: '#fefdf5',
    text: '#3d3929',
    textSecondary: '#7c7560',
    gridLines: '#e8e4cc',
    accent: '#5f7c47',
    headerBg: '#fefdf5',
    todayHighlight: 'rgba(95, 124, 71, 0.06)',
    shadow: '0 1px 3px rgba(61, 57, 41, 0.1)',
  },
  eventColors: [
    '#a3be8c', // sage
    '#b5a76c', // olive/gold
    '#c87d5a', // terracotta
    '#7ca982', // moss
    '#d4a574', // wheat
    '#8fbcbb', // muted teal
  ],
  fonts: {
    display: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
  },
};
