// Loads built-in and admin-published themes and applies the player's choice.
import { sanitizeTheme, themeVars, themeAttrs } from "../core/theme.js";
import { serverThemes } from "./api.js";
import { load, save } from "./storage.js";

let themes = [];
let defaultId = "pixel-retro";

export async function loadThemes() {
  const [index, remote] = await Promise.all([
    fetch("themes/index.json", { cache: "no-cache" }).then((r) => r.json()),
    serverThemes(),
  ]);
  defaultId = index.default ?? defaultId;
  const seen = new Set();
  themes = [];
  for (const raw of [...index.themes, ...remote.map((t) => ({ ...t, remote: true }))]) {
    const { theme, errors } = sanitizeTheme(raw);
    if (errors.length || seen.has(theme.id)) { if (errors.length) console.warn(`Skipping theme ${raw?.id}:`, errors); continue; }
    seen.add(theme.id);
    themes.push({ ...theme, remote: !!raw.remote });
  }
  return themes;
}

export const listThemes = () => themes;
export const currentThemeId = () => {
  const id = load("theme", defaultId);
  return themes.some((t) => t.id === id) ? id : defaultId;
};

/** Apply a theme object to the page (used both for the saved choice and live previews). */
export function applyTheme(theme) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVars(theme))) root.style.setProperty(k, v);
  for (const [k, v] of Object.entries(themeAttrs(theme))) root.setAttribute(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.colors.bg);
}

export function useTheme(id) {
  const theme = themes.find((t) => t.id === id) ?? themes.find((t) => t.id === defaultId) ?? themes[0];
  if (!theme) return;
  save("theme", theme.id);
  applyTheme(theme);
}

export const restoreTheme = () => useTheme(currentThemeId());
