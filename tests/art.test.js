import { test } from "node:test";
import assert from "node:assert/strict";
import { sameName, pickCharacter, generatedArt } from "../src/core/art.js";
import { resolveItems } from "../src/core/catalog.js";
import { readFileSync } from "node:fs";

test("names match across romanisations and MyAnimeList's 'Last, First' order", () => {
  for (const [a, b] of [["Kyojuro Rengoku", "Rengoku, Kyoujurou"], ["Charlotte Katakuri", "Katakuri, Charlotte"], ["Goku", "Son, Goku"],
    ["Kaido", "Kaidou"], ["Sung Jinwoo", "Sung, Jin-Woo"], ["Neji Hyuga", "Hyuuga, Neji"]]) assert.ok(sameName(a, b), `${a} ~ ${b}`);
  assert.equal(sameName("Marco", "Marcos"), false);
  const roster = [{ name: "Marco", main: false, url: "a" }, { name: "Monkey D., Luffy", main: true, url: "b" }, { name: "Luffy, Clone", main: false, url: "c" }];
  assert.equal(pickCharacter(roster, "Luffy").url, "b");
});

test("generated art is a deterministic, valid SVG data URL", () => {
  const a = generatedArt("Gura Gura no Mi");
  assert.equal(a, generatedArt("Gura Gura no Mi"));
  assert.notEqual(a, generatedArt("Mera Mera no Mi"));
  assert.match(decodeURIComponent(a), /^data:image\/svg\+xml;charset=utf-8,<svg[\s\S]*>G<\/text><\/svg>$/);
  assert.ok(!decodeURIComponent(generatedArt('<script>"&')).includes("<script>"), "names are escaped");
});

test("anime items carry a MyAnimeList lookup; Devil Fruits has 64", () => {
  const deep = JSON.parse(readFileSync(new URL("../categories/anime-deep.json", import.meta.url)));
  const fruits = deep.find((c) => c.id === "anime-op-devil-fruits");
  const items = resolveItems(fruits);
  assert.equal(items.length, 64);
  assert.ok(items.every((i) => i.mal?.anime.includes(21) && i.mal.char && i.info));
  assert.equal(items.find((i) => i.name === "Hie Hie no Mi").mal.char, "Kuzan");
});
