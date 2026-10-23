// Character pictures from MyAnimeList, through the free Jikan API (https://jikan.moe, CORS enabled).
// Used by the browser only when there is no server of ours (e.g. GitHub Pages).
// One small search per character (most popular first), queued to respect Jikan's rate limit,
// cached in localStorage. Whole anime rosters are not used: for long series they are huge and slow.
import { sameName } from "../core/art.js";

const API = "https://api.jikan.moe/v4";
const CACHE_KEY = "nb.malImages.v2";
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

async function lookup(char) {
  const { data = [] } = await jikan(`/characters?${new URLSearchParams({ q: char, order_by: "favorites", sort: "desc", limit: "10" })}`);
  const hit = data.find((c) => sameName(char, c.name) && usable(image(c)));
  return hit ? image(hit) : null;
}

const inflight = new Map();

/** Promise of a picture URL for { char }, or null. */
export function malImage({ char }) {
  if (!char) return Promise.resolve(null);
  if (char in cache) return Promise.resolve(cache[char]);
  if (!inflight.has(char)) {
    inflight.set(char, lookup(char)
      .then((url) => { cache[char] = url; saveCache(); return url; })
      .catch(() => null) // network trouble: do not cache, try again next time
      .finally(() => inflight.delete(char)));
  }
  return inflight.get(char);
}
