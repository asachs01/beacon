const THEME_KEY = "td-theme";
const DARK_KEY = "td-dark";

export function getStoredTheme(): string {
  if (typeof localStorage === "undefined") return "beacon";
  return localStorage.getItem(THEME_KEY) || "beacon";
}

export function setStoredTheme(id: string): void {
  localStorage.setItem(THEME_KEY, id);
  document.documentElement.setAttribute("data-theme", id);
}

export function getStoredDark(): boolean | null {
  if (typeof localStorage === "undefined") return null;
  const val = localStorage.getItem(DARK_KEY);
  if (val === null) return null;
  return val === "true";
}

export function setStoredDark(dark: boolean): void {
  localStorage.setItem(DARK_KEY, String(dark));
  document.documentElement.classList.toggle("dark", dark);
}
