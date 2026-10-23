// Loads every category: the JSON files shipped in /categories plus the ones the admin
// created on the server. Adding a category to the repo = drop a JSON file + list it in index.json.
import { resolveItems, validateCategory } from "../core/catalog.js";
import { serverCategories } from "./api.js";

const CUSTOM_GROUP = { id: "custom", name: { it: "Novità dall'admin", en: "New from the admin" } };

let pokemonData = null;
const pokemon = async () => (pokemonData ??= await (await fetch("data/pokemon.json")).json());

export async function loadCatalog() {
  const index = await (await fetch("categories/index.json", { cache: "no-cache" })).json();
  const [files, remote, dex] = await Promise.all([
    Promise.all(index.files.map((f) => fetch(`categories/${f}`, { cache: "no-cache" }).then((r) => r.json()))),
    serverCategories(),
    pokemon(),
  ]);
  const all = [...remote.map((c) => ({ ...c, group: c.group || "custom", remote: true })), ...files.flat()];
  const categories = [];
  const seen = new Set();
  for (const c of all) {
    const errors = validateCategory(c);
    if (errors.length) { console.warn(`Skipping category ${c?.id}:`, errors); continue; }
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    categories.push({ ...c, size: resolveItems(c, dex).length });
  }
  const groups = [...(remote.length ? [CUSTOM_GROUP] : []), ...index.groups];
  return { groups, categories, byId: new Map(categories.map((c) => [c.id, c])) };
}

export async function itemsOf(category) {
  return resolveItems(category, await pokemon());
}
