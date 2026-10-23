// Single-elimination bracket, kept pure so it can be unit-tested and saved as JSON.
//
// A bracket is just { entrants, choices }: the shuffled entrants and the list of
// picks made so far (0 = left, 1 = right). Everything else (current match, round,
// ranking) is derived by replaying the picks. That makes undo trivial and keeps
// the saved state tiny and impossible to corrupt.

/** Fisher–Yates shuffle on a copy. */
export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sizes offered to the player for a pool of `poolSize` items. */
export function sizeOptions(poolSize, presets = [8, 16, 32, 64, 128]) {
  const sizes = presets.filter((s) => s <= poolSize);
  if (!sizes.includes(poolSize) && poolSize >= 2) sizes.push(poolSize); // "all"
  return sizes;
}

/** Create a new bracket with `size` random entrants from `items`. */
export function createBracket(items, size = items.length, rng = Math.random) {
  if (items.length < 2) throw new Error("A bracket needs at least 2 entrants");
  const n = Math.max(2, Math.min(size, items.length));
  return { entrants: shuffle(items, rng).slice(0, n), choices: [] };
}

export const choose = (bracket, side) => {
  if (side !== 0 && side !== 1) throw new Error("side must be 0 or 1");
  if (replay(bracket).champion) return bracket;
  return { ...bracket, choices: [...bracket.choices, side] };
};

export const undo = (bracket) => ({ ...bracket, choices: bracket.choices.slice(0, -1) });

const isPow2 = (n) => (n & (n - 1)) === 0;
const prevPow2 = (n) => 2 ** Math.floor(Math.log2(n));

/**
 * Replay all choices and describe the current state.
 * When the entrant count is not a power of two, a preliminary round trims the
 * field down to one (the others get a bye), so every later round is balanced.
 */
export function replay({ entrants, choices }) {
  const n = entrants.length;
  let queue, byes;
  if (isPow2(n)) {
    queue = [...entrants];
    byes = [];
  } else {
    const extra = n - prevPow2(n);
    queue = entrants.slice(0, extra * 2);
    byes = entrants.slice(extra * 2);
  }
  const totalRounds = Math.ceil(Math.log2(n));
  const eliminated = []; // in order of elimination
  const duels = [];
  let round = 1;
  let winners = [];
  let champion = null;
  let preliminary = !isPow2(n);
  let fieldSize = queue.length + byes.length; // contenders alive at round start

  let picks = 0;
  for (const side of choices) {
    if (champion) break;
    const k = winners.length;
    const a = queue[2 * k], b = queue[2 * k + 1];
    const w = side === 0 ? a : b;
    const l = side === 0 ? b : a;
    winners.push(w);
    eliminated.push({ entrant: l, round });
    duels.push({ round, a, b, winner: w });
    picks++;
    if (winners.length * 2 === queue.length) {
      const next = [...winners, ...byes];
      if (next.length === 1) {
        champion = next[0];
      } else {
        queue = next;
        byes = [];
        winners = [];
        round++;
        preliminary = false;
        fieldSize = queue.length;
      }
    }
  }

  const k = winners.length;
  const ranking = champion ? [champion, ...eliminated.map((e) => e.entrant).reverse()] : null;
  return {
    round,
    totalRounds,
    preliminary,
    fieldSize,
    matchIndex: k,
    matchesInRound: queue.length / 2,
    match: champion ? null : [queue[2 * k], queue[2 * k + 1]],
    picksMade: picks,
    totalPicks: n - 1,
    champion,
    ranking,
    eliminated,
    duels,
  };
}

/** Human key for the round label: "final", "semi", "quarter", "round16" or "roundN". */
export function roundKey({ fieldSize, preliminary }) {
  if (preliminary) return { key: "preliminary" };
  if (fieldSize === 2) return { key: "final" };
  if (fieldSize === 4) return { key: "semi" };
  if (fieldSize === 8) return { key: "quarter" };
  return { key: "roundOf", n: fieldSize };
}
