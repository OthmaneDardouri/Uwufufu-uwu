// Per-player statistics, stored in the player's own browser. Pure functions over plain JSON.
//
// stats = { [categoryId]: { games, titles: {key: n}, duels: {key: {name, w, l}}, recent: [...] } }

const RECENT_LIMIT = 20;

/** Record a finished bracket. `summary` comes from bracket.replay(). Returns new stats. */
export function recordGame(stats, categoryId, summary, now = Date.now()) {
  const prev = stats[categoryId] ?? { games: 0, titles: {}, duels: {}, recent: [] };
  const titles = { ...prev.titles };
  const duels = structuredClone(prev.duels);
  const champ = summary.champion;
  titles[champ.key] = (titles[champ.key] ?? 0) + 1;
  for (const d of summary.duels) {
    const loser = d.winner === d.a ? d.b : d.a;
    for (const [e, won] of [[d.winner, true], [loser, false]]) {
      const s = (duels[e.key] ??= { name: e.name, w: 0, l: 0 });
      s.name = e.name;
      if (won) s.w++; else s.l++;
    }
  }
  const podium = summary.ranking.slice(0, 4).map(({ key, name }) => ({ key, name }));
  const recent = [{ at: now, size: summary.ranking.length, podium }, ...prev.recent].slice(0, RECENT_LIMIT);
  return { ...stats, [categoryId]: { games: prev.games + 1, titles, duels, recent } };
}

/** Champions sorted by number of titles. */
export function topChampions(catStats, limit = 10) {
  const names = Object.fromEntries(Object.entries(catStats?.duels ?? {}).map(([k, v]) => [k, v.name]));
  return Object.entries(catStats?.titles ?? {})
    .map(([key, n]) => ({ key, name: names[key] ?? key, titles: n }))
    .sort((a, b) => b.titles - a.titles)
    .slice(0, limit);
}

/** Entrants sorted by duel win rate; needs a minimum number of duels to be meaningful. */
export function topByWinRate(catStats, minDuels = 3, limit = 10) {
  return Object.entries(catStats?.duels ?? {})
    .map(([key, s]) => ({ key, name: s.name, w: s.w, l: s.l, rate: s.w / (s.w + s.l) }))
    .filter((s) => s.w + s.l >= minDuels)
    .sort((x, y) => y.rate - x.rate || y.w - x.w)
    .slice(0, limit);
}
