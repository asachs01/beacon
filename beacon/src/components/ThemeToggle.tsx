import { useTheme } from '../hooks/useTheme';

type CycleMode = 'skylight' | 'midnight' | 'auto';

const MODES: CycleMode[] = ['midnight', 'skylight', 'auto'];

const MODE_ICONS: Record<CycleMode, string> = {
  skylight: '\u2600\uFE0F',  // sun
  midnight: '\uD83C\uDF19',  // crescent moon
  auto: '\uD83D\uDD04',      // cycle arrows
};

const MODE_LABELS: Record<CycleMode, string> = {
  skylight: 'Light mode',
  midnight: 'Dark mode',
  auto: 'Auto (time-based)',
};

export function ThemeToggle() {
  const { themeId, setTheme } = useTheme();

  // Map the current themeId to one of the cycle modes so the button
  // always cycles through light -> dark -> auto regardless of which
  // theme is actually active.
  const currentMode: CycleMode = MODES.includes(themeId as CycleMode)
    ? (themeId as CycleMode)
    : 'skylight';

  const cycleTheme = () => {
    const currentIndex = MODES.indexOf(currentMode);
    const nextIndex = (currentIndex + 1) % MODES.length;
    setTheme(MODES[nextIndex]);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycleTheme}
      aria-label={MODE_LABELS[currentMode]}
      title={MODE_LABELS[currentMode]}
    >
      <span className="theme-toggle-icon">{MODE_ICONS[currentMode]}</span>
    </button>
  );
}
