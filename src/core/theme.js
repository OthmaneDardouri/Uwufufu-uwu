// Themes are data, not CSS. A theme picks colours, two bundled fonts and a few named
// effects; style.css implements each effect once. That keeps themes safe to accept from
// an AI (no arbitrary CSS can sneak in) and makes adding one a matter of writing JSON.

export const FONTS = [
  "Orbitron", "Rajdhani", "Cinzel", "Cinzel Decorative", "Audiowide", "Share Tech Mono", "VT323",
  "Space Grotesk", "Press Start 2P", "Exo 2", "Poiret One", "Josefin Sans", "Chakra Petch", "Monoton", "IM Fell English",
];

export const EFFECTS = {
  background: ["grid", "gears", "sunset", "scanlines", "aurora", "runes", "checker", "rain", "deco", "dots", "none"],
  title: ["glow", "chromatic", "gradient", "emboss", "pixel", "terminal", "none"],
  shadow: ["glow", "hard", "soft", "none"],
  corners: ["square", "rounded", "pill", "cut"],
  border: ["solid", "double", "accent-top", "none"],
  case: ["none", "upper"],
};

export const COLOR_KEYS = ["bg", "bg2", "surface", "text", "muted", "accent", "accent2", "line"];

const HEX = /^#[0-9a-f]{6}$/i;
const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);

/** Returns { theme, errors }. `theme` is normalised (defaults filled, numbers clamped). */
export function sanitizeTheme(input) {
  const errors = [];
  const t = input ?? {};
  if (!ID_RE.test(t.id ?? "")) errors.push(`invalid id "${t.id}"`);
  if (!t.name) errors.push("missing name");
  const colors = {};
  for (const k of COLOR_KEYS) {
    const v = t.colors?.[k];
    if (typeof v === "string" && HEX.test(v)) colors[k] = v.toLowerCase();
    else errors.push(`colors.${k} must be a #rrggbb hex colour`);
  }
  const font = (f, d) => (FONTS.includes(f) ? f : (f != null && errors.push(`unknown font "${f}"`), d));
  const pick = (kind, v, d) => (EFFECTS[kind].includes(v) ? v : (v != null && errors.push(`unknown ${kind} "${v}"`), d));
  const theme = {
    id: t.id,
    name: t.name,
    colors,
    fonts: { display: font(t.fonts?.display, "Orbitron"), body: font(t.fonts?.body, "Rajdhani") },
    shape: {
      corners: pick("corners", t.shape?.corners, "square"),
      radius: clamp(t.shape?.radius, 0, 32, 8),
      border: pick("border", t.shape?.border, "solid"),
      borderWidth: clamp(t.shape?.borderWidth, 0, 6, 1),
    },
    effects: {
      background: pick("background", t.effects?.background, "none"),
      title: pick("title", t.effects?.title, "none"),
      shadow: pick("shadow", t.effects?.shadow, "none"),
      case: pick("case", t.effects?.case, "none"),
      tracking: clamp(t.effects?.tracking, -0.05, 0.4, 0.02),
    },
  };
  return { theme, errors };
}

/** CSS custom properties for a (sanitised) theme. */
export function themeVars(theme) {
  const c = theme.colors;
  const fontStack = (f) => `"${f}", system-ui, sans-serif`;
  return {
    "--bg": c.bg, "--bg2": c.bg2, "--surface": c.surface, "--text": c.text, "--muted": c.muted,
    "--accent": c.accent, "--accent2": c.accent2, "--line": c.line,
    "--font-display": fontStack(theme.fonts.display), "--font-body": fontStack(theme.fonts.body),
    "--radius": `${theme.shape.radius}px`, "--bw": `${theme.shape.borderWidth}px`,
    "--tracking": `${theme.effects.tracking}em`,
  };
}

/** data-* attributes that switch the effect rules in style.css. */
export function themeAttrs(theme) {
  return {
    "data-bg": theme.effects.background, "data-title": theme.effects.title, "data-shadow": theme.effects.shadow,
    "data-corners": theme.shape.corners, "data-border": theme.shape.border, "data-case": theme.effects.case,
  };
}

const expandHex = (v) => {
  if (typeof v !== "string") return null;
  const h = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(h)) return h;
  if (/^#[0-9a-f]{8}$/.test(h)) return h.slice(0, 7); // drop alpha
  if (/^#[0-9a-f]{3}$/.test(h)) return `#${[...h.slice(1)].map((c) => c + c).join("")}`;
  if (/^[0-9a-f]{6}$/.test(h)) return `#${h}`;
  return null;
};

const toSlug = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/**
 * Lenient version of sanitizeTheme for themes pasted or imported by the admin (often written by
 * an AI in a chat): fixes the usual slips (#fff, name as a string, name_it/name_en, missing id),
 * fills anything still missing from `fallback`, and returns what it had to fix as warnings.
 */
export function repairTheme(raw, fallback, n = 1) {
  const t = raw?.theme && typeof raw.theme === "object" ? raw.theme : raw ?? {};
  const name = typeof t.name === "string" ? { it: t.name, en: t.name }
    : t.name && typeof t.name === "object" ? t.name
    : t.name_it || t.name_en ? { it: t.name_it ?? t.name_en, en: t.name_en ?? t.name_it }
    : { it: `Tema ${n}`, en: `Theme ${n}` };
  let id = toSlug(t.id) || toSlug(name.en || name.it) || `theme-${n}`;
  if (id.length < 2) id = `theme-${id}`;
  const colors = {};
  for (const k of COLOR_KEYS) colors[k] = expandHex(t.colors?.[k]) ?? fallback.colors[k];
  const candidate = {
    id, name, colors,
    fonts: { ...fallback.fonts, ...t.fonts },
    shape: { ...fallback.shape, ...t.shape },
    effects: { ...fallback.effects, ...t.effects },
  };
  const { theme, errors } = sanitizeTheme(candidate);
  const missing = COLOR_KEYS.filter((k) => !expandHex(t.colors?.[k]));
  const warnings = [...errors, ...(missing.length ? [`colours taken from the current theme: ${missing.join(", ")}`] : [])];
  return { theme, warnings, idea: typeof t.idea === "string" ? t.idea : undefined };
}
