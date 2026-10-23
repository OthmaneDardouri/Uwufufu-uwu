import { test } from "node:test";
import assert from "node:assert/strict";
import { createBracket, choose, undo, replay, sizeOptions, roundKey } from "../src/core/bracket.js";

const items = (n) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, name: `Item ${i}` }));
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const playOut = (b, pick = () => 0) => {
  while (!replay(b).champion) b = choose(b, pick(replay(b)));
  return b;
};

test("a power-of-two bracket takes n-1 picks and ranks everyone", () => {
  for (const n of [2, 4, 8, 16, 32, 128]) {
    const b = playOut(createBracket(items(n), n, seeded(n)));
    const s = replay(b);
    assert.equal(b.choices.length, n - 1);
    assert.equal(s.ranking.length, n);
    assert.equal(new Set(s.ranking.map((e) => e.key)).size, n);
    assert.equal(s.totalRounds, Math.log2(n));
  }
});

test("odd sizes use a preliminary round and still finish", () => {
  for (const n of [3, 5, 6, 7, 9, 13, 100, 151]) {
    const b0 = createBracket(items(n), n, seeded(n));
    assert.equal(replay(b0).preliminary, true);
    assert.equal(roundKey(replay(b0)).key, "preliminary");
    const s = replay(playOut(b0, () => 1));
    assert.equal(s.ranking.length, n);
    assert.equal(s.picksMade, n - 1);
  }
});

test("always picking the left entrant crowns the first shuffled entrant", () => {
  const b = createBracket(items(8), 8, seeded(3));
  assert.equal(replay(playOut(b)).champion, b.entrants[0]);
});

test("undo restores the previous match exactly", () => {
  let b = createBracket(items(16), 16, seeded(7));
  b = choose(choose(b, 1), 0);
  const before = replay(b).match;
  const after = replay(undo(choose(b, 1))).match;
  assert.deepEqual(after, before);
});

test("choosing after the final does nothing; invalid sides throw", () => {
  const done = playOut(createBracket(items(4), 4, seeded(2)));
  assert.equal(choose(done, 0), done);
  assert.throws(() => choose(createBracket(items(4)), 2));
});

test("round labels follow the field size", () => {
  let b = createBracket(items(16), 16, seeded(5));
  const labels = [];
  while (!replay(b).champion) {
    const s = replay(b);
    if (s.matchIndex === 0) labels.push(roundKey(s).key + (roundKey(s).n ?? ""));
    b = choose(b, 0);
  }
  assert.deepEqual(labels, ["roundOf16", "quarter", "semi", "final"]);
});

test("size options never exceed the pool and include 'all'", () => {
  assert.deepEqual(sizeOptions(151), [8, 16, 32, 64, 128, 151]);
  assert.deepEqual(sizeOptions(20), [8, 16, 20]);
  assert.deepEqual(sizeOptions(16), [8, 16]);
  assert.deepEqual(sizeOptions(5), [5]);
});

test("createBracket samples without duplicates", () => {
  const b = createBracket(items(50), 16, seeded(9));
  assert.equal(b.entrants.length, 16);
  assert.equal(new Set(b.entrants.map((e) => e.key)).size, 16);
  assert.throws(() => createBracket(items(1)));
});
