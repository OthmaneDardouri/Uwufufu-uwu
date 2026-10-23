import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { filterPokemon, resolveItems, validateCategory, localized } from "../src/core/catalog.js";
import { sanitizeTheme } from "../src/core/theme.js";

const root = new URL("../", import.meta.url);
const pokemon = JSON.parse(readFileSync(new URL("data/pokemon.json", root)));
const index = JSON.parse(readFileSync(new URL("categories/index.json", root)));
const categories = index.files.flatMap((f) => JSON.parse(readFileSync(new URL(`categories/${f}`, root))));

test("every category file is listed in the index", () => {
  const onDisk = readdirSync(new URL("categories/", root)).filter((f) => f !== "index.json");
  assert.deepEqual(onDisk.sort(), [...index.files].sort());
});

test("all shipped categories are valid, have unique ids and a known group", () => {
  const groups = new Set(index.groups.map((g) => g.id));
  const ids = new Set();
  for (const c of categories) {
    assert.deepEqual(validateCategory(c), [], c.id);
    assert.ok(groups.has(c.group), `${c.id} has unknown group ${c.group}`);
    assert.ok(!ids.has(c.id), `duplicate id ${c.id}`);
    ids.add(c.id);
    assert.ok(resolveItems(c, pokemon).length >= 2, `${c.id} resolves to fewer than 2 items`);
  }
});

test("pokemon filters return the expected counts", () => {
  const count = (filter) => filterPokemon(pokemon, filter).length;
  assert.equal(count({ gens: [1] }), 151);
  assert.equal(count({}), 1025);
  assert.equal(count({ tagsAny: ["starter1"] }), 27);
  assert.equal(count({ tagsAny: ["pseudo"] }), 10);
  assert.ok(count({ tagsAny: ["mega"] }) >= 48);
});

test("alternate forms only appear when asked for", () => {
  assert.ok(filterPokemon(pokemon, { types: ["fire"] }).every((e) => !e.f.includes("form")));
  assert.ok(filterPokemon(pokemon, { tagsAny: ["mega"] }).every((e) => e.f.includes("mega")));
});

test("tagsNone excludes, types match either slot", () => {
  const finals = filterPokemon(pokemon, { tagsAny: ["final"], tagsNone: ["legendary", "mythical"] });
  assert.ok(finals.every((e) => !e.f.includes("legendary") && !e.f.includes("mythical")));
  assert.ok(filterPokemon(pokemon, { types: ["flying"] }).some((e) => e.n === "Charizard"));
});

test("list items get stable unique keys", () => {
  const items = resolveItems({ items: [{ name: "Pokémon Rosso" }, { name: "Pokémon Rosso" }, { name: "Zelda" }] });
  assert.deepEqual(items.map((i) => i.key), ["pokemon-rosso", "zelda"]);
});

test("validation reports useful problems", () => {
  assert.ok(validateCategory({ id: "Bad Id", name: "x", group: "g", items: [] }).length >= 2);
  assert.deepEqual(validateCategory({ id: "ok-id", name: "x", group: "g", items: [{ name: "a" }, { name: "b" }] }), []);
});

test("localized falls back sensibly", () => {
  assert.equal(localized({ it: "Ciao", en: "Hi" }, "it"), "Ciao");
  assert.equal(localized({ en: "Hi" }, "it"), "Hi");
  assert.equal(localized("Plain", "en"), "Plain");
});

test("built-in themes are valid and the default exists", () => {
  const { default: def, themes } = JSON.parse(readFileSync(new URL("themes/index.json", root)));
  assert.ok(themes.some((t) => t.id === def));
  for (const t of themes) assert.deepEqual(sanitizeTheme(t).errors, [], t.id);
});

test("anime categories: every item has a picture source and names are unique", () => {
  for (const c of categories.filter((x) => x.group === "anime")) {
    assert.ok(c.items.every((i) => i.wiki), `${c.id}: item without wiki title`);
    assert.equal(new Set(c.items.map((i) => i.name)).size, c.items.length, `${c.id}: duplicate names`);
  }
});

test("wikipedia list pages and section redirects never become pictures", async () => {
  const { isGenericPage } = await import("../src/services/images.js");
  assert.equal(isGenericPage("List of One Piece characters", false), true);
  assert.equal(isGenericPage("Kaido", true), true);
  assert.equal(isGenericPage("Mercury (disambiguation)", false), true);
  assert.equal(isGenericPage("Monkey D. Luffy", false), false);
});

test("fan-level anime categories explain every item", () => {
  const deep = categories.filter((x) => x.group === "anime-deep");
  assert.ok(deep.length >= 8);
  for (const c of deep) {
    for (const i of c.items) assert.ok(typeof i.info === "string" && i.info.length > 10 && i.info.length <= 160, `${c.id}: ${i.name}`);
    assert.ok(resolveItems(c).every((i) => i.info), `${c.id}: info lost in resolveItems`);
  }
});
