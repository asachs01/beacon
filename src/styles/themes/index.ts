export interface Theme {
  id: string;
  name: string;
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    gridLines: string;
    accent: string;
    headerBg: string;
    todayHighlight: string;
    shadow: string;
  };
  /** 6 pastel/accent colors assigned to family members */
  eventColors: string[];
  fonts: {
    display: string;
    body: string;
    mono: string;
  };
}

import { skylight } from './skylight';
import { midnight } from './midnight';
import { midnightLight } from './midnight-light';
import { nord } from './nord';
import { dracula } from './dracula';
import { monokai } from './monokai';
import { rose } from './rose';
import { forest } from './forest';

/** All available themes, ordered for display in the picker. */
export const themes: Theme[] = [
  skylight,
  midnight,
  midnightLight,
  nord,
  dracula,
  monokai,
  rose,
  forest,
];

const themeMap = new Map<string, Theme>(themes.map((t) => [t.id, t]));

/**
 * Look up a theme by id. Falls back to skylight if the id is unknown.
 */
export function getTheme(id: string): Theme {
  return themeMap.get(id) ?? skylight;
}
