// Claude integrations, used only by the admin endpoints:
//   - generateCategory: a one-line idea -> a category draft
//   - generateThemes:   image and/or description and/or base theme -> theme variants ("style transfer")
// Both force a tool call, so Claude's answer is structured JSON that we validate afterwards.
import { FONTS, EFFECTS, COLOR_KEYS } from "../src/core/theme.js";

const API_URL = "https://api.anthropic.com/v1/messages";

async function callTool({ apiKey, model, system, tool, content, fetchImpl = fetch }) {
  const res = await fetchImpl(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 8000, system, tools: [tool], tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw Object.assign(new Error(`Claude API error ${res.status}`), { status: 502, detail: detail.slice(0, 500) });
  }
  const data = await res.json();
  const call = data.content?.find((c) => c.type === "tool_use" && c.name === tool.name);
  if (!call) throw Object.assign(new Error("Claude did not return the expected data"), { status: 502 });
  return call.input;
}

const slugify = (s, fallback) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || fallback;

// --- categories ------------------------------------------------------------

const CATEGORY_TOOL = {
  name: "publish_category",
  description: "Publish a category of entrants for a 1-vs-1 'pick your favourite' bracket game.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "kebab-case id, lowercase ascii, e.g. 'souls-bosses'" },
      name_it: { type: "string", description: "Short title in Italian" },
      name_en: { type: "string", description: "Short title in English" },
      description_it: { type: "string", description: "One short sentence in Italian" },
      description_en: { type: "string", description: "One short sentence in English" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Display name" },
            sub: { type: "string", description: "Short second line: year, franchise, platform, who uses it..." },
            info: { type: "string", description: "One short sentence in Italian explaining what it is or does, for items a fan might not remember (abilities, techniques, events). Omit for self-explanatory items." },
            wiki: { type: "string", description: "Exact title of the English Wikipedia article about this item (used to fetch its picture)" },
            pokemon: { type: "integer", description: "Only for Pokémon: PokeAPI pokemon id (national dex number for base forms)" },
          },
          required: ["name"],
        },
      },
    },
    required: ["id", "name_it", "name_en", "items"],
  },
};

const CATEGORY_SYSTEM = `You curate lists for a "pick your favourite" bracket game (like uwufufu).
Rules:
- Return exactly the requested number of entrants, all distinct, real and recognisable.
- Prefer variety and fan favourites; no filler.
- For every item that is a Pokémon set "pokemon" to its PokeAPI id. Otherwise set "wiki" to the exact English Wikipedia article title, so a picture can be fetched.
- Keep "sub" under 40 characters and "info" under 140.
- Specific, fan-level categories are welcome (e.g. Devil Fruits, jutsu, transformations): then fill "info" and set "wiki" to the character most associated with the item.
Always answer by calling the publish_category tool.`;

export const categoryRequestText = (prompt, count) => `Category idea: ${prompt}\nNumber of entrants: ${count}`;

/** Convert the tool call into our category format (still a draft: the admin reviews it). */
export function toCategory(input) {
  const items = (input.items ?? []).map(({ name, sub, info, wiki, pokemon }) => ({
    name: String(name).trim(),
    ...(sub && { sub: String(sub).trim() }),
    ...(info && { info: String(info).trim().slice(0, 300) }),
    ...(Number.isInteger(pokemon) && pokemon > 0 ? { pokemon } : wiki ? { wiki: String(wiki).trim() } : {}),
  }));
  const first = items[0];
  return {
    id: `ai-${slugify(input.id, "category")}`,
    group: "custom",
    name: { it: input.name_it, en: input.name_en },
    ...(input.description_it && { description: { it: input.description_it, en: input.description_en ?? input.description_it } }),
    ...(first && { cover: first.pokemon ? { pokemon: first.pokemon } : { wiki: first.wiki } }),
    items,
  };
}

export async function generateCategory({ apiKey, model, prompt, count, fetchImpl }) {
  const input = await callTool({
    apiKey, model, fetchImpl, system: CATEGORY_SYSTEM, tool: CATEGORY_TOOL, content: categoryRequestText(prompt, count),
  });
  return toCategory(input);
}

// --- themes (style transfer) -----------------------------------------------

const hex = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
const THEME_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "kebab-case id, lowercase ascii" },
    name_it: { type: "string" },
    name_en: { type: "string" },
    idea: { type: "string", description: "One short Italian sentence: what makes this variant different from the others" },
    colors: {
      type: "object",
      description: "bg: page background (dark enough for light text unless the brief is clearly light). bg2: secondary background tone for gradients. surface: card background. text: main text, high contrast on surface. muted: secondary text. accent: main highlight. accent2: second highlight. line: borders.",
      properties: Object.fromEntries(COLOR_KEYS.map((k) => [k, hex])),
      required: COLOR_KEYS,
    },
    fonts: {
      type: "object",
      properties: { display: { type: "string", enum: FONTS }, body: { type: "string", enum: FONTS } },
      required: ["display", "body"],
    },
    shape: {
      type: "object",
      properties: {
        corners: { type: "string", enum: EFFECTS.corners },
        radius: { type: "integer", minimum: 0, maximum: 32 },
        border: { type: "string", enum: EFFECTS.border },
        borderWidth: { type: "integer", minimum: 0, maximum: 6 },
      },
      required: ["corners", "radius", "border", "borderWidth"],
    },
    effects: {
      type: "object",
      properties: {
        background: { type: "string", enum: EFFECTS.background },
        title: { type: "string", enum: EFFECTS.title },
        shadow: { type: "string", enum: EFFECTS.shadow },
        case: { type: "string", enum: EFFECTS.case },
        tracking: { type: "number", minimum: -0.05, maximum: 0.4, description: "letter spacing of titles in em" },
      },
      required: ["background", "title", "shadow", "case", "tracking"],
    },
  },
  required: ["id", "name_it", "name_en", "idea", "colors", "fonts", "shape", "effects"],
};

const THEMES_TOOL = {
  name: "publish_themes",
  description: "Propose visual themes for the bracket game website. Each one is a distinct option the owner can choose from.",
  input_schema: {
    type: "object",
    properties: { themes: { type: "array", items: THEME_SCHEMA, minItems: 1, maxItems: 4 } },
    required: ["themes"],
  },
};

const THEME_SYSTEM = `You are a UI designer creating themes for a game website, using only the options the publish_themes tool allows.
The brief can be a reference image, a text description, an existing theme to start from, or a mix.
- With an image: sample real colours from it and match its mood, era and style.
- With a base theme: keep its spirit and change what the brief asks for; without other instructions, vary it.
- Make the variants genuinely different from each other (e.g. faithful, darker or neon, calmer or minimal), not small tweaks; say how in "idea".
- Keep text readable (aim for WCAG AA contrast between text and surface).
- Choose fonts and effects that fit (e.g. pixel art -> Press Start 2P + pixel title; Victorian brass -> Cinzel + gears).
- Give each a short evocative name.
Always answer by calling the publish_themes tool.`;

const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

export function parseImage(dataUrl) {
  const m = DATA_URL.exec(dataUrl ?? "");
  return m ? { media_type: m[1], data: m[2] } : null;
}

export function toTheme(input) {
  const { name_it, name_en, id, idea, ...rest } = input;
  return { ...rest, id: `ai-${slugify(id, "theme")}`, name: { it: name_it, en: name_en }, ...(idea && { idea: String(idea).slice(0, 200) }) };
}

/** Build the user message for theme generation (exported for tests). */
export function themeRequestContent({ image, prompt, base, count }) {
  const lines = [`Propose ${count} distinct theme variant${count > 1 ? "s" : ""}.`];
  if (image) lines.push("Use the attached image as the main reference.");
  if (prompt) lines.push(`Owner's description: ${prompt}`);
  if (base) lines.push(`Start from this existing theme (JSON): ${JSON.stringify(base)}`);
  return [...(image ? [{ type: "image", source: { type: "base64", ...image } }] : []), { type: "text", text: lines.join("\n") }];
}

/** image: {media_type, data} | null, prompt: string, base: theme | null, count: 1-4 → theme drafts */
export async function generateThemes({ apiKey, model, image, prompt, base, count = 3, fetchImpl }) {
  const content = themeRequestContent({ image, prompt, base, count });
  const input = await callTool({ apiKey, model, fetchImpl, system: THEME_SYSTEM, tool: THEMES_TOOL, content });
  return (input.themes ?? []).slice(0, 4).map(toTheme);
}
