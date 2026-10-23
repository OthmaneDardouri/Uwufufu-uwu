#!/usr/bin/env node
// Finds a picture for every item that has no fixed one (anime characters, Devil Fruits, jutsu,
// films…) and writes them to data/pictures.json, so the site shows them at once without
// searching. Runs in GitHub Actions (.github/workflows/pictures.yml), which can reach Fandom,
// MyAnimeList and Wikipedia; it also runs fine on any computer with internet.
//
//   node scripts/resolve_pictures.mjs          keep pictures already found, search the rest
//   node scripts/resolve_pictures.mjs --all    search everything again
//
// The file also lists what was not found and why, which is how missing pictures get fixed.
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveItems, coverItem } from "../src/core/catalog.js";
import { imageQuery, pictureKey, needsSearch } from "../src/core/pictures.js";
import { createImageResolver, UA } from "../server/images.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "data/pictures.json");
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const readJson = async (f) => JSON.parse(await readFile(path.join(root, f), "utf8"));

const all = process.argv.includes("--all");
const previous = await readJson("data/pictures.json").catch(() => ({ pictures: {} }));

// every search the site can make, with the categories it appears in
const index = await readJson("categories/index.json");
const dex = await readJson("data/pokemon.json");
const searches = new Map();
for (const file of index.files) {
  for (const category of await readJson(`categories/${file}`)) {
    const items = resolveItems(category, dex);
    for (const item of [...items, coverItem(category, items)]) {
      if (!needsSearch(item)) continue;
      const q = imageQuery(item);
      const key = pictureKey(q);
      if (!searches.has(key)) searches.set(key, { q, categories: new Set() });
      searches.get(key).categories.add(category.id);
    }
  }
}

/**
 * How a picture host reacts to the three ways the site loads pictures: a browser on another
 * site (sends a Referer), the same browser with referrerPolicy="no-referrer", and our server's proxy.
 */
const WAYS = {
  "browser+referer": { "user-agent": BROWSER_UA, referer: "https://example.github.io/" },
  "browser,no-referer": { "user-agent": BROWSER_UA },
  proxy: { "user-agent": UA },
};
async function probe(url, headers) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    const type = res.headers.get("content-type") ?? "";
    await res.body?.cancel();
    return res.ok && type.startsWith("image/") ? "ok" : `${res.status} ${type}`;
  } catch (err) {
    return err.message;
  }
}
async function checkHosts(urls, perHost = 3) {
  const byHost = {};
  for (const u of urls) (byHost[new URL(u).host] ??= []).length < perHost && byHost[new URL(u).host].push(u);
  const out = {};
  for (const [host, sample] of Object.entries(byHost)) {
    out[host] = {};
    for (const [way, headers] of Object.entries(WAYS)) {
      const answers = [];
      for (const u of sample) { answers.push(await probe(u, headers)); await new Promise((r) => setTimeout(r, 300)); }
      out[host][way] = [...new Set(answers)].join(" / ");
    }
  }
  return out;
}

const dir = await mkdtemp(path.join(os.tmpdir(), "pictures-"));
const resolver = await createImageResolver({ dir });
const pictures = {};
const misses = {};
const todo = [...searches.entries()];
let done = 0;

async function worker() {
  for (let next = todo.shift(); next; next = todo.shift()) {
    const [key, { q, categories }] = next;
    const known = previous.pictures?.[key];
    if (known && !all) {
      pictures[key] = known;
    } else {
      const r = await resolver.resolve(q, { fresh: true }).catch((err) => ({ url: null, tried: [{ source: "script", error: err.message }] }));
      if (r.url) {
        pictures[key] = r.url;
      } else {
        misses[key] = { categories: [...categories], tried: r.tried.map((t) => (t.error ? `${t.source}: ${t.error}` : t.source)) };
      }
    }
    if (++done % 50 === 0) console.log(`${done}/${searches.size}`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await resolver.flush();
await rm(dir, { recursive: true, force: true });

const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const hosts = await checkHosts(Object.values(pictures));
const body = { found: Object.keys(pictures).length, missing: Object.keys(misses).length, hosts, pictures: sorted(pictures), misses: sorted(misses) };
const same = JSON.stringify({ ...previous, updated: undefined }) === JSON.stringify(body);
if (!same) await writeFile(OUT, `${JSON.stringify({ updated: new Date().toISOString(), ...body }, null, 1)}\n`);

console.log(`found ${body.found} of ${searches.size}, missing ${body.missing}${same ? " (no change)" : ""}`);
console.log(JSON.stringify(hosts, null, 1));
for (const [key, m] of Object.entries(body.misses).slice(0, 40)) console.log(`  miss ${key}  ← ${m.tried.join(" · ")}`);
