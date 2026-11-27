export interface ThemePreset {
  id: string;
  name: string;
  /** Preview swatch colors: [bg, accent, text] */
  preview: [string, string, string];
}

export const themes: ThemePreset[] = [
  { id: "beacon", name: "Beacon", preview: ["#0f172a", "#f59e0b", "#f8fafc"] },
  { id: "default", name: "Default", preview: ["#0a0a0a", "#3b82f6", "#ededed"] },
  { id: "nord", name: "Nord", preview: ["#2e3440", "#88c0d0", "#eceff4"] },
  { id: "dracula", name: "Dracula", preview: ["#282a36", "#bd93f9", "#f8f8f2"] },
  { id: "catppuccin", name: "Catppuccin", preview: ["#1e1e2e", "#cba6f7", "#cdd6f4"] },
  { id: "gruvbox", name: "Gruvbox", preview: ["#282828", "#fabd2f", "#ebdbb2"] },
  { id: "solarized", name: "Solarized", preview: ["#002b36", "#268bd2", "#839496"] },
  { id: "tokyo-night", name: "Tokyo Night", preview: ["#1a1b26", "#7aa2f7", "#a9b1d6"] },
  { id: "one-dark", name: "One Dark", preview: ["#282c34", "#61afef", "#abb2bf"] },
];
