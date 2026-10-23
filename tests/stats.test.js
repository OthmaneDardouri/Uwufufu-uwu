import { test } from "node:test";
import assert from "node:assert/strict";
import { createBracket, choose, replay } from "../src/core/bracket.js";
import { recordGame, topChampions, topByWinRate } from "../src/core/stats.js";

const items = Array.from({ length: 8 }, (_, i) => ({ key: `k${i}`, name: `Item ${i}` }));

function finished() {
  let b = createBracket(items, 8, () => 0.5);
  while (!replay(b).champion) b = choose(b, 0);
  return replay(b);
}

test("recording a game counts titles, duels and recent podiums", () => {
  const s = finished();
  let stats = recordGame({}, "cat", s, 1000);
  stats = recordGame(stats, "cat", s, 2000);
  const c = stats.cat;
  assert.equal(c.games, 2);
  assert.equal(c.titles[s.champion.key], 2);
  assert.equal(c.duels[s.champion.key].w, 6); // 3 wins per game
  assert.equal(c.recent.length, 2);
  assert.equal(c.recent[0].at, 2000);
  assert.equal(topChampions(c)[0].key, s.champion.key);
  assert.equal(topByWinRate(c)[0].key, s.champion.key);
});

test("recording does not mutate the previous stats", () => {
  const s = finished();
  const a = recordGame({}, "cat", s);
  const snapshot = JSON.stringify(a);
  recordGame(a, "cat", s);
  assert.equal(JSON.stringify(a), snapshot);
});
