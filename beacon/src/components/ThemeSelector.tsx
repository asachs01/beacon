import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../hooks/useTheme';
import { themes } from '../styles/themes';

/**
 * Theme picker shown as a palette icon in the header.
 * Opens a dropdown with mini color-dot previews for each theme.
 * Click to apply; selection saved to localStorage via useTheme.
 */
export function ThemeSelector() {
  const { themeId, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const autoEntry = {
    id: 'auto',
    name: 'Auto (time)',
    previewColors: ['#faf9f6', '#0f172a', '#3b82f6', '#f59e0b', '#94a3b8'],
  };

  const themeEntries = [
    autoEntry,
    ...themes.map((t) => ({
      id: t.id,
      name: t.name,
      previewColors: [
        t.colors.background,
        t.colors.surface,
        t.colors.accent,
        t.eventColors[0],
        t.eventColors[2],
      ],
    })),
  ];

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="sidebar-icon"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Change theme"
        title="Change Theme"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2Z" />
        </svg>
      </button>

      {open && (
        <div
          className="theme-selector-dropdown"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 'calc(100% + 8px)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            padding: 8,
            minWidth: 200,
            zIndex: 1000,
            animation: 'fade-in 150ms ease',
          }}
        >
          {themeEntries.map((entry) => {
            const isActive = entry.id === themeId;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setTheme(entry.id);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: 'none',
                  background: isActive
                    ? 'var(--bg-today)'
                    : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 150ms ease',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: 'var(--text-primary)',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background =
                      'var(--bg-today)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background =
                      'transparent';
                  }
                }}
              >
                {/* Color dot strip */}
                <span
                  style={{
                    display: 'flex',
                    gap: 3,
                    flexShrink: 0,
                  }}
                >
                  {entry.previewColors.map((color, i) => (
                    <span
                      key={i}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: color,
                        border: '1px solid rgba(128,128,128,0.2)',
                      }}
                    />
                  ))}
                </span>

                <span style={{ flex: 1 }}>{entry.name}</span>

                {isActive && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
