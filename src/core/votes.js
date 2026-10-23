// Twitch chat voting, the pure part: parse IRC lines, read a vote, keep a tally.
// One vote per viewer per duel; if they vote again, the last one counts.

/** Parse one IRC line from Twitch chat. Returns a ping, a chat message, or null for anything else. */
export function parseIrcLine(line) {
  if (line.startsWith("PING")) return { type: "ping", payload: line.slice(5) };
  // :nick!nick@nick.tmi.twitch.tv PRIVMSG #channel :message text
  const m = /^:([^!\s]+)![^\s]+ PRIVMSG #[^\s]+ :(.*)$/.exec(line);
  return m ? { type: "message", user: m[1].toLowerCase(), text: m[2] } : null;
}

/** "1" / "!1" votes left, "2" / "!2" votes right; only the first word counts. */
export function voteFromText(text) {
  const first = text.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (first === "1" || first === "!1") return 0;
  if (first === "2" || first === "!2") return 1;
  return null;
}

export const emptyTally = () => ({ byUser: {}, counts: [0, 0] });

export function addVote(tally, user, side) {
  const prev = tally.byUser[user];
  if (prev === side) return tally;
  const counts = [...tally.counts];
  if (prev !== undefined) counts[prev]--;
  counts[side]++;
  return { byUser: { ...tally.byUser, [user]: side }, counts };
}

/** 0 or 1 when one side leads, null on a tie or with no votes. */
export function leader({ counts: [a, b] }) {
  return a === b ? null : a > b ? 0 : 1;
}
