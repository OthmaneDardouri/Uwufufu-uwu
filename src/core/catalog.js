// Category model: validation and item resolution. No DOM, no fetch — pure and testable.
//
// A category is either
//   { id, group, name, source: { type: "pokemon", filter } }   -> items come from data/pokemon.json
//   { id, group, name, items: [{ name, sub?, info?, image?, wiki?, pokemon? }] }
// `info` is a short explanation shown on hover (e.g. what a Devil Fruit does).
// Anime pictures: category `malAnime: [MyAnimeList anime ids]` + item `char` (character to show,
// defaults to the item name) and optional item `anime` (ids, overrides the category's).
// Category `fandom: "onepiece"` + item `title` (English page title on that Fandom wiki) give the server
// a precise picture source for techniques, fruits, arcs…
// `name` / `description` may be a plain string or { it, en }.

export const MIN_ITEMS = 2;
const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** Returns a list of human-readable problems; empty means valid. */
export function validateCategory(c) {
  const errors = [];
  if (!c || typeof c !== "object") return ["category must be an object"];
  if (!ID_RE.test(c.id ?? "")) errors.push(`invalid id "${c.id}" (lowercase letters, digits, dashes)`);
  if (!c.name || (typeof c.name !== "string" && typeof c.name !== "object")) errors.push("missing name");
  if (!c.group) errors.push("missing group");
  if (c.source) {
    if (c.source.type !== "pokemon") errors.push(`unknown source type "${c.source.type}"`);
  } else if (!Array.isArray(c.items) || c.items.length < MIN_ITEMS) {
    errors.push(`needs "source" or at least ${MIN_ITEMS} items`);
  } else {
    c.items.forEach((it, i) => {
      if (!it || typeof it.name !== "string" || !it.name.trim()) errors.push(`item ${i} has no name`);
    });
  }
  return errors;
}

/**
 * Filter the Pokémon dataset.
 * filter: { gens?: number[], types?: string[], tagsAny?: string[], tagsNone?: string[] }
 * Alternate forms (tag "form") only appear when a filter explicitly asks for one of their tags.
 */
export function filterPokemon(entries, filter = {}) {
  const { gens, types, tagsAny, tagsNone } = filter;
  return entries.filter((e) => {
    if (e.f.includes("form") && !(tagsAny ?? []).some((t) => e.f.includes(t))) return false;
    if (gens?.length && !gens.includes(e.g)) return false;
    if (types?.length && !types.some((t) => e.t.includes(t))) return false;
    if (tagsAny?.length && !tagsAny.some((t) => e.f.includes(t))) return false;
    if (tagsNone?.length && tagsNone.some((t) => e.f.includes(t))) return false;
    return true;
  });
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Normalised entrants: every item gets a stable `key` used for stats. */
export function resolveItems(category, pokemon = []) {
  if (category.source?.type === "pokemon") {
    return filterPokemon(pokemon, category.source.filter).map((e) => ({
      key: `pkmn-${e.id}`,
      name: e.n,
      // ids >= 10000 are alternate forms and have no Pokédex number of their own
      sub: (e.id < 10000 ? `#${String(e.id).padStart(4, "0")} · ` : "") + `Gen ${ROMAN[e.g] ?? e.g}`,
      pokemon: e.id,
      types: e.t,
    }));
  }
  const seen = new Set();
  return (category.items ?? []).flatMap((it) => {
    let key = it.key ?? slug(it.name);
    if (seen.has(key)) return []; // drop duplicates
    seen.add(key);
    const anime = it.anime ?? category.malAnime;
    const mal = anime?.length || it.char ? { anime: anime ?? [], char: it.char ?? it.name } : undefined;
    const fandom = category.fandom ? { wiki: category.fandom, title: it.title } : undefined;
    return [{ key, name: it.name, sub: it.sub, info: it.info, image: it.image, wiki: it.wiki, pokemon: it.pokemon, mal, fandom }];
  });
}

/** Pick the right language from a string or { it, en } object. */
export function localized(value, lang, fallback = "en") {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[lang] ?? value[fallback] ?? Object.values(value)[0] ?? "";
}
