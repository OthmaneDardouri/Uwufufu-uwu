import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIrcLine, voteFromText, emptyTally, addVote, leader } from "../src/core/votes.js";
import { connectChat } from "../src/services/twitch.js";

test("parses chat messages and pings, ignores the rest", () => {
  assert.deepEqual(parseIrcLine(":Mario!mario@mario.tmi.twitch.tv PRIVMSG #canale :1 vai gengar"), { type: "message", user: "mario", text: "1 vai gengar" });
  assert.deepEqual(parseIrcLine("PING :tmi.twitch.tv"), { type: "ping", payload: ":tmi.twitch.tv" });
  assert.equal(parseIrcLine(":tmi.twitch.tv 001 justinfan123 :Welcome, GLHF!"), null);
});

test("votes: first word 1/2 or !1/!2 only", () => {
  assert.equal(voteFromText("1"), 0);
  assert.equal(voteFromText("!2 forza"), 1);
  assert.equal(voteFromText("  2  "), 1);
  assert.equal(voteFromText("12"), null);
  assert.equal(voteFromText("ho votato 1"), null);
  assert.equal(voteFromText(""), null);
});

test("one vote per viewer, the last one counts", () => {
  let t = emptyTally();
  t = addVote(t, "a", 0);
  t = addVote(t, "b", 0);
  t = addVote(t, "c", 1);
  assert.deepEqual(t.counts, [2, 1]);
  assert.equal(leader(t), 0);
  t = addVote(t, "a", 1);
  t = addVote(t, "a", 1);
  assert.deepEqual(t.counts, [1, 2]);
  assert.equal(leader(t), 1);
  t = addVote(t, "b", 1);
  t = addVote(t, "c", 0);
  t = addVote(t, "a", 0);
  assert.equal(leader(addVote(emptyTally(), "x", 0)), 0);
  assert.equal(leader(emptyTally()), null);
});

test("chat connection: anonymous login, join, pong, messages, clean close", () => {
  const sockets = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.sent = []; sockets.push(this); }
    send(s) { this.sent.push(s); }
    close() { this.onclose?.(); }
  }
  const got = [];
  const statuses = [];
  const chat = connectChat("#MioCanale", { WebSocketImpl: FakeSocket, onMessage: (u, m) => got.push([u, m]), onStatus: (s) => statuses.push(s) });
  const ws = sockets[0];
  ws.onopen();
  assert.match(ws.sent[1], /^NICK justinfan\d+$/);
  assert.equal(ws.sent[2], "JOIN #miocanale");
  ws.onmessage({ data: ":justinfan1.tmi.twitch.tv 366 justinfan1 #miocanale :End of /NAMES list\r\nPING :tmi.twitch.tv\r\n:luca!luca@luca.tmi.twitch.tv PRIVMSG #miocanale :2\r\n" });
  assert.equal(ws.sent.at(-1), "PONG :tmi.twitch.tv");
  assert.deepEqual(got, [["luca", "2"]]);
  chat.close();
  assert.deepEqual(statuses, ["connecting", "live", "closed"]);
  assert.throws(() => connectChat("x y", { WebSocketImpl: FakeSocket }));
});
