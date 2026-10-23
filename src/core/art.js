// Pure helpers for pictures: matching character names across sources, and a generated
// picture for anything no source knows, so a card never stays empty.

const strip = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Japanese romanisation varies ("Kyoujurou" / "Kyojuro", "Gojou" / "Gojo"): long vowels are folded.
const foldVowels = (t) => t.replace(/ou/g, "o").replace(/(.)\1/g, "$1");

/** "Monkey D., Luffy" → ["monkey", "d", "luffy"] */
export const nameTokens = (s) => strip(s).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).map(foldVowels);

/**
 * Does `candidate` (e.g. MyAnimeList's "Katakuri, Charlotte") name the same character as `query`
 * ("Charlotte Katakuri")? Every word of the query must appear, in any order; two adjacent words
 * of the candidate also count as one ("Jin-Woo" matches "Jinwoo").
 */
export function sameName(query, candidate) {
  const q = nameTokens(query), ct = nameTokens(candidate);
  const c = new Set([...ct, ...ct.slice(1).map((t, i) => ct[i] + t)]);
  return q.length > 0 && q.every((t) => c.has(t));
}

/** Pick the best entry of a MyAnimeList roster for a name; main characters first. */
export function pickCharacter(roster, query) {
  const hits = roster.filter((r) => sameName(query, r.name));
  hits.sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0) || nameTokens(a.name).length - nameTokens(b.name).length);
  return hits[0] ?? null;
}

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

const STOP = /^(no|mi|di|del|della|the|of|de|la|il|modelo|modello|model)$/;
const initials = (name) => [...new Set(nameTokens(name).filter((w) => !STOP.test(w)))].slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A deterministic picture for a name: two neon hues picked from the name, a few shapes, the initials.
 * Returned as a data: URL, so it works offline and never fails to load.
 */
export function generatedArt(name) {
  const h = hash(name);
  const hue1 = h % 360, hue2 = (hue1 + 70 + ((h >> 9) % 90)) % 360;
  const rot = (h >> 3) % 360;
  const rings = [0, 1, 2].map((i) => {
    const r = 70 + ((h >> (i * 5)) % 120);
    const cx = 80 + ((h >> (i * 7)) % 240), cy = 80 + ((h >> (i * 11)) % 240);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="hsl(${i % 2 ? hue2 : hue1} 90% 65% / .35)" stroke-width="${2 + i * 2}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<defs><linearGradient id="g" gradientTransform="rotate(${rot} .5 .5)"><stop offset="0" stop-color="hsl(${hue1} 70% 22%)"/><stop offset="1" stop-color="hsl(${hue2} 75% 14%)"/></linearGradient>
<radialGradient id="r"><stop offset="0" stop-color="hsl(${hue2} 95% 70% / .55)"/><stop offset="1" stop-color="transparent"/></radialGradient></defs>
<rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="200" r="170" fill="url(#r)"/>${rings}
<text x="200" y="200" dy=".35em" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="150" fill="#fff" fill-opacity=".92">${esc(initials(name))}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
