// Server-side picture lookup for items that have no fixed image (anime techniques, Devil Fruits,
// characters…). Running it on the server avoids browser limits (CORS, slow huge responses) and
// lets every visitor share one disk cache.
//
// Sources, in order:
//   1. the series' Fandom wiki: page image for the item's title, then for its character
//   2. MyAnimeList through Jikan: character search, most popular first
//   3. English Wikipedia: page image
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { sameName } from "../src/core/art.js";

// Wikimedia asks bots to say who they are and how to reach them, or it answers 429/403
export const UA = "NeonBracket/1.0 (https://github.com/OthmaneDardouri/Uwufufu-uwu; fan project picture lookup)";
const MISS_TTL = 24 * 3600_000; // retry misses after a day
const WIKI_RE = /^[a-z0-9-]{2,40}$/;

export function parseImageQuery(params) {
  const s = (k, max = 120) => (params.get(k) ?? "").trim().slice(0, max);
  const q = { name: s("name"), char: s("char"), title: s("title"), wiki: s("wiki", 200), fandom: s("fandom", 40) };
  if (q.fandom && !WIKI_RE.test(q.fandom)) q.fandom = "";
  if (!q.name && !q.char && !q.title && !q.wiki) return null;
  return q;
}

/** Stable id for a lookup, used for the cache and for the admin's manual pictures. */
export const imageKey = (q) => createHash("sha1").update(JSON.stringify([q.fandom, q.title, q.name, q.char, q.wiki])).digest("hex");

/** overrides: optional store of { id: imageKey, url } chosen by the admin; they win over every source. */
export async function createImageResolver({ dir, fetchImpl = fetch, now = () => Date.now(), overrides = null }) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "images.json");
  let cache = {};
  try { cache = JSON.parse(await readFile(file, "utf8")); } catch { cache = {}; }
  let saveTimer = null;
  const writeNow = async () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(cache));
      await rename(tmp, file);
    } catch (err) {
      console.error("image cache not saved:", err.message); // the cache is a convenience, never fatal
    }
  };
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 500);
  };

  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  /** GET JSON; on 429 or a dropped connection wait a little and try again (3 tries). */
  async function getJson(url) {
    for (let attempt = 1; ; attempt++) {
      let res;
      try {
        res = await fetchImpl(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      } catch (err) {
        if (attempt >= 3) throw err;
        await pause(1500 * attempt);
        continue;
      }
      if (res.status === 429 && attempt < 3) { await pause(3000 * attempt); continue; }
      if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
      return res.json();
    }
  }

  // Jikan allows ~3 requests/second and Wikipedia dislikes bursts: one request at a time each
  const queue = (gap) => {
    let line = Promise.resolve();
    return (url) => {
      const p = line.then(() => getJson(url));
      line = p.catch(() => {}).then(() => pause(gap));
      return p;
    };
  };
  const jikan = queue(400);
  const wikipedia = queue(150);

  async function mediawikiImage(base, titles, get = getJson) {
    const params = new URLSearchParams({
      action: "query", format: "json", redirects: "1", prop: "pageimages", piprop: "thumbnail",
      pithumbsize: "480", pilicense: "any", titles: titles.join("|"),
    });
    const { query = {} } = await get(`${base}?${params}`);
    const hop = new Map([...(query.normalized ?? []), ...(query.redirects ?? [])].map((r) => [r.from, r]));
    const pages = new Map(Object.values(query.pages ?? {}).map((p) => [p.title, p.thumbnail?.source ?? null]));
    for (const t of titles) { // keep the caller's order of preference
      let cur = t, section = false;
      for (let i = 0; i < 4 && hop.has(cur); i++) { const r = hop.get(cur); section ||= !!r.tofragment; cur = r.to; }
      if (/^List of /i.test(cur) || /\(disambiguation\)$/i.test(cur)) continue;
      const url = pages.get(cur);
      if (url && !(section && base.includes("wikipedia"))) return url;
    }
    return null;
  }

  // Fandom wikis, two ways: the page's lead image (PageImages), else the first big picture used on the page.
  const fandomApi = (wiki) => `https://${wiki}.fandom.com/api.php`;

  async function fandomGallery(wiki, titles) {
    for (const title of titles) {
      const params = new URLSearchParams({
        action: "query", format: "json", redirects: "1", titles: title, generator: "images", gimlimit: "30",
        prop: "imageinfo", iiprop: "url|size", iiurlwidth: "480",
      });
      const { query = {} } = await getJson(`${fandomApi(wiki)}?${params}`);
      const files = Object.values(query.pages ?? {})
        .map((p) => ({ name: p.title ?? "", info: p.imageinfo?.[0] }))
        .filter((f) => f.info && f.info.width >= 150 && !/\.svg$|icon|logo|flag|symbol|signature|jolly roger/i.test(f.name));
      if (files.length) return files[0].info.thumburl ?? files[0].info.url;
    }
    return null;
  }

  async function lookup(q, tried) {
    const attempt = async (source, fn) => {
      try {
        const url = await fn();
        tried.push({ source, ok: !!url, url });
        return url;
      } catch (err) {
        tried.push({ source, error: err.message });
        return null;
      }
    };
    if (q.fandom) {
      const titles = [...new Set([q.title, q.name, q.char].filter(Boolean))];
      for (const [step, fn] of [["lead", mediawikiImage], ["gallery", fandomGallery]]) {
        const url = await attempt(`fandom:${q.fandom}:${step}`, () => (step === "lead" ? fn(fandomApi(q.fandom), titles) : fn(q.fandom, titles)));
        if (url) return { url, source: "fandom" };
      }
    }
    const who = q.char; // only anime characters: a film or game title would match some random character
    if (who) {
      const url = await attempt("myanimelist", async () => {
        const { data = [] } = await jikan(`https://api.jikan.moe/v4/characters?${new URLSearchParams({ q: who, order_by: "favorites", sort: "desc", limit: "10" })}`);
        const hit = data.find((c) => sameName(who, c.name));
        const img = hit?.images?.webp?.image_url ?? hit?.images?.jpg?.image_url;
        return img && !/questionmark/i.test(img) ? img : null;
      });
      if (url) return { url, source: "myanimelist" };
    }
    if (q.wiki) {
      const url = await attempt("wikipedia", () => mediawikiImage("https://en.wikipedia.org/w/api.php", [q.wiki], wikipedia));
      if (url) return { url, source: "wikipedia" };
    }
    return { url: null, source: null };
  }

  const inflight = new Map();

  /** { url, source, cached, tried? } — `tried` lists every source and what it answered (for debugging). */
  async function resolve(q, { fresh = false } = {}) {
    const id = imageKey(q);
    const manual = overrides?.get(id);
    if (manual?.url) return { url: manual.url, source: "manual", cached: true, key: id };
    const key = JSON.stringify([q.fandom, q.title, q.name, q.char, q.wiki]);
    const hit = cache[key];
    if (!fresh && hit && (hit.url || now() - hit.at < MISS_TTL)) return { url: hit.url, source: hit.source, cached: true, key: id };
    if (!inflight.has(key)) {
      inflight.set(key, (async () => {
        const tried = [];
        const found = await lookup(q, tried);
        // only remember a miss when every source actually answered (no network errors)
        if (found.url || tried.every((t) => !t.error)) {
          cache[key] = { url: found.url, source: found.source, at: now() };
          save();
        }
        return { ...found, cached: false, tried, key: id };
      })().finally(() => inflight.delete(key)));
    }
    return inflight.get(key);
  }

  /** Write pending cache changes now (used on shutdown and in tests). */
  const flush = () => (saveTimer ? writeNow() : Promise.resolve());

  return { resolve, flush };
}
