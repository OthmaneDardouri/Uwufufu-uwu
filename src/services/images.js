// Resolves the picture for an item.
//   { image }   -> used as is
//   { pokemon } -> official artwork from the PokeAPI sprites repo
//   { wiki }    -> lead image of the English Wikipedia article, looked up in batches
// Wikipedia answers are cached in localStorage so each title is asked only once per browser.

const ARTWORK = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/";
const WIKI_API = "https://en.wikipedia.org/w/api.php";
const CACHE_KEY = "nb.wikiImages.v2"; // bump when the lookup rules change
const BATCH = 50; // API limit for titles per request

let cache = {};
try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}"); } catch { cache = {}; }
const saveCache = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* quota/private mode: fine */ } };

const pending = new Map(); // title -> [resolve]
let timer = null;

async function flush() {
  timer = null;
  const titles = [...pending.keys()];
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    const results = await lookup(chunk).catch(() => ({}));
    for (const t of chunk) {
      const url = results[t] ?? null;
      if (t in results) cache[t] = url; // only cache real answers, not network failures
      for (const resolve of pending.get(t) ?? []) resolve(url);
      pending.delete(t);
    }
  }
  saveCache();
}

/**
 * A minor character often has no article of its own: Wikipedia redirects to a section of
 * "List of … characters", whose picture is the same for everyone. Better a monogram than a wrong picture.
 */
export function isGenericPage(title, viaSectionRedirect) {
  return viaSectionRedirect || /^List of /i.test(title) || /\(disambiguation\)$/i.test(title);
}

async function lookup(titles) {
  const params = new URLSearchParams({
    action: "query", format: "json", origin: "*", redirects: "1",
    prop: "pageimages", piprop: "thumbnail", pithumbsize: "640", pilicense: "any",
    titles: titles.join("|"),
  });
  const res = await fetch(`${WIKI_API}?${params}`);
  if (!res.ok) throw new Error(`wikipedia ${res.status}`);
  const { query = {} } = await res.json();
  // follow the title through normalisation and redirects to the page that was returned
  const hop = new Map([...(query.normalized ?? []), ...(query.redirects ?? [])].map((r) => [r.from, r]));
  const byTitle = new Map(Object.values(query.pages ?? {}).map((p) => [p.title, p.thumbnail?.source ?? null]));
  const out = {};
  for (const t of titles) {
    let cur = t;
    let section = false;
    for (let i = 0; i < 3 && hop.has(cur); i++) {
      const r = hop.get(cur);
      section ||= !!r.tofragment;
      cur = r.to;
    }
    out[t] = isGenericPage(cur, section) ? null : byTitle.get(cur) ?? null;
  }
  return out;
}

function wikiImage(title) {
  if (title in cache) return Promise.resolve(cache[title]);
  return new Promise((resolve) => {
    if (!pending.has(title)) pending.set(title, []);
    pending.get(title).push(resolve);
    timer ??= setTimeout(flush, 20);
  });
}

/** Promise of an image URL, or null when the item has no picture. */
export function imageFor(item) {
  if (!item) return Promise.resolve(null);
  if (item.image) return Promise.resolve(item.image);
  if (item.pokemon) return Promise.resolve(`${ARTWORK}${item.pokemon}.png`);
  if (item.wiki) return wikiImage(item.wiki);
  return Promise.resolve(null);
}

/** Warm the cache for upcoming matches so pictures appear instantly. */
export function prefetch(items) {
  for (const it of items) {
    imageFor(it).then((url) => { if (url) new Image().src = url; });
  }
}
