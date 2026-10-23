// Character pictures from MyAnimeList, through the free Jikan API (https://jikan.moe, CORS enabled).
// For an item { mal: { anime: [21], char: "Kuzan" } }:
//   1. load the character roster of each listed anime (one request per anime, kept in memory)
//   2. find the character by name
//   3. otherwise search characters by name, most popular first
// Answers are cached in localStorage; requests are queued to respect Jikan's rate limit.
import { pickCharacter, sameName } from "../core/art.js";

const API = "https://api.jikan.moe/v4";
const CACHE_KEY = "nb.malImages.v1";
const GAP_MS = 400; // Jikan allows ~3 requests/second

let cache = {};
try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}"); } catch { cache = {}; }
const saveCache = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* fine */ } };

let queue = Promise.resolve();
function jikan(path) {
  const run = async (retry = true) => {
    const res = await fetch(`${API}${path}`);
    if (res.status === 429 && retry) {
      await new Promise((r) => setTimeout(r, 1500));
      return run(false);
    }
    if (!res.ok) throw new Error(`jikan ${res.status}`);
    return res.json();
  };
  const p = queue.then(run);
  queue = p.catch(() => {}).then(() => new Promise((r) => setTimeout(r, GAP_MS)));
  return p;
}

const image = (c) => c?.images?.webp?.image_url ?? c?.images?.jpg?.image_url ?? null;
const usable = (url) => url && !/questionmark|apple-touch-icon/i.test(url); // MAL's "no picture" placeholder

const rosters = new Map(); // anime id -> Promise<[{name, main, url}]>
function roster(id) {
  if (!rosters.has(id)) {
    rosters.set(id, jikan(`/anime/${id}/characters`)
      .then(({ data = [] }) => data.map((d) => ({ name: d.character?.name ?? "", main: d.role === "Main", url: image(d.character) })))
      .catch(() => { rosters.delete(id); return null; })); // null = could not load
  }
  return rosters.get(id);
}

async function lookup(anime, char) {
  for (const id of anime) {
    const list = await roster(id);
    // roster unreachable: give up for now (not cached) instead of queueing slow searches
    if (!list) throw new Error("roster unavailable");
    const hit = pickCharacter(list.filter((r) => usable(r.url)), char);
    if (hit) return hit.url;
  }
  // not in the rosters (or no anime given): one search, most popular characters first
  const { data = [] } = await jikan(`/characters?${new URLSearchParams({ q: char, order_by: "favorites", sort: "desc", limit: "10" })}`);
  const hit = data.find((c) => sameName(char, c.name) && usable(image(c)));
  if (hit) return image(hit);
  return null;
}

/** Fetch the character lists of these anime in the background (one request each). */
export function preloadRosters(ids) {
  for (const id of new Set(ids)) roster(id);
}

const inflight = new Map();

/** Promise of a picture URL for { anime: number[], char: string }, or null. */
export function malImage({ anime = [], char }) {
  if (!char) return Promise.resolve(null);
  const key = `${anime.join(",")}|${char}`;
  if (key in cache) return Promise.resolve(cache[key]);
  if (!inflight.has(key)) {
    inflight.set(key, lookup(anime, char)
      .then((url) => { cache[key] = url; saveCache(); return url; })
      .catch(() => null) // network trouble: do not cache, try again next time
      .finally(() => inflight.delete(key)));
  }
  return inflight.get(key);
}
