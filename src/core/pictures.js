// What identifies a picture search. Shared by the browser, the server and the script that
// pre-computes pictures (scripts/resolve_pictures.mjs), so all three agree on the same key.

/** The fields a picture search uses. */
export const imageQuery = (item) => ({
  name: item.name, char: item.mal?.char, title: item.fandom?.title, fandom: item.fandom?.wiki, wiki: item.wiki,
});

/** Readable, stable key of a search, e.g. "onepiece|Hie Hie no Mi|Hie Hie no Mi|Kuzan|". */
export const pictureKey = (q) => [q.fandom, q.title, q.name, q.char, q.wiki].map((v) => v ?? "").join("|");

/** Items whose picture must be searched for (no fixed image, not a Pokémon). */
export const needsSearch = (item) => !!item && !item.image && !item.pokemon && !!(item.fandom || item.mal || item.wiki);
