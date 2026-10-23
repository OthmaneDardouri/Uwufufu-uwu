// Prompts for the "use your Claude.ai subscription" flow: the admin panel builds a ready prompt,
// opens claude.ai with it, and the admin pastes Claude's JSON answer back. No API key needed.
// Pure functions, shared shape with what the server-side generation produces.
import { FONTS, EFFECTS, COLOR_KEYS } from "./theme.js";

export const CLAUDE_NEW_CHAT = "https://claude.ai/new";

/** URL that opens a new Claude.ai chat with the prompt pre-filled (the prompt is also copied, as a fallback). */
export const claudeUrl = (prompt) => `${CLAUDE_NEW_CHAT}?q=${encodeURIComponent(prompt)}`;

export function categoryPrompt(idea, count) {
  return `Create a category for my "pick your favourite" bracket game (like uwufufu).
Idea: ${idea}
Number of entries: exactly ${count}, all distinct, real and recognisable, fan favourites first.

Answer ONLY with one JSON object in a code block, in this exact shape:
{
  "id": "kebab-case-id",
  "group": "custom",
  "name": { "it": "Titolo breve in italiano", "en": "Short English title" },
  "description": { "it": "Una frase.", "en": "One sentence." },
  "items": [
    { "name": "Display name", "sub": "short second line (year, series, who uses it)", "info": "one short Italian sentence explaining it, for items fans may not remember", "wiki": "Exact English Wikipedia article title (for the picture)" }
  ]
}
Rules: for Pokémon use "pokemon": <PokeAPI id> instead of "wiki". "sub" under 40 characters, "info" under 140 (omit it when obvious). For abilities, techniques or items, set "wiki" to the character most associated with it.`;
}

export function themePrompt({ description, base, count, withImage }) {
  const brief = [
    withImage && "Use the image I attach to this message as the main reference (sample real colours, match its mood and era).",
    description && `Description: ${description}`,
    base && `Start from this existing theme and vary it: ${JSON.stringify(base)}`,
  ].filter(Boolean).join("\n");
  return `Design ${count} visual theme${count > 1 ? "s" : ""} for my game website, genuinely different from each other (e.g. faithful, darker/neon, calmer).
${brief}

Answer ONLY with one JSON object in a code block: { "themes": [ ... ] }, each theme exactly like this:
{
  "id": "kebab-case-id",
  "name": { "it": "Nome", "en": "Name" },
  "idea": "one short Italian sentence: what makes this variant different",
  "colors": { ${COLOR_KEYS.map((k) => `"${k}": "#rrggbb"`).join(", ")} },
  "fonts": { "display": "<font>", "body": "<font>" },
  "shape": { "corners": "<corners>", "radius": 0-32, "border": "<border>", "borderWidth": 0-6 },
  "effects": { "background": "<background>", "title": "<title>", "shadow": "<shadow>", "case": "<case>", "tracking": -0.05 to 0.4 }
}
Allowed values — fonts: ${FONTS.join(", ")}; corners: ${EFFECTS.corners.join(", ")}; border: ${EFFECTS.border.join(", ")}; background: ${EFFECTS.background.join(", ")}; title: ${EFFECTS.title.join(", ")}; shadow: ${EFFECTS.shadow.join(", ")}; case: ${EFFECTS.case.join(", ")}.
Colours: bg = page background, bg2 = second background tone, surface = cards, text = main text (high contrast on surface), muted = secondary text, accent and accent2 = highlights, line = borders.`;
}

/**
 * Pull the JSON out of whatever was pasted: a bare object, a ```json code block,
 * or text around it. Throws a readable error when nothing parses.
 */
export function extractJson(text) {
  const src = String(text ?? "").trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(src);
  const candidates = [fenced?.[1], src];
  const first = src.search(/[[{]/);
  if (first >= 0) candidates.push(src.slice(first, Math.max(src.lastIndexOf("}"), src.lastIndexOf("]")) + 1));
  for (const c of candidates) {
    if (!c) continue;
    try { return JSON.parse(c.trim()); } catch { /* try the next candidate */ }
  }
  throw new Error("no valid JSON found in the pasted text");
}

/** A pasted theme answer may be one theme, an array, or { themes: [...] }. */
export function themesFromAnswer(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.themes)) return value.themes;
  return [value];
}
