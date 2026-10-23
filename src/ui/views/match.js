// The duel screen. Click/tap a card, or use ← → (also A/D, 1/2). Z or Backspace undoes.
// In streamer mode the Twitch chat votes with "1" / "2"; the streamer can always override by clicking.
import { html, picture, hydratePictures, $ } from "../dom.js";
import { t, lang } from "../../i18n.js";
import { localized } from "../../core/catalog.js";
import { replay, choose, undo, roundKey } from "../../core/bracket.js";
import { emptyTally, addVote, voteFromText, leader } from "../../core/votes.js";
import { currentGame, saveGame, clearGame } from "../../game.js";
import { prefetch } from "../../services/images.js";
import { connectChat } from "../../services/twitch.js";

const PICK_ANIMATION_MS = 320;

export function roundLabel(state) {
  const { key, n } = roundKey(state);
  if (key !== "roundOf") return t(key);
  return n === 16 || n === 32 ? t(`roundOf${n}`) : t("roundOfN", { n });
}

export default function match(root, { catalog, navigate }) {
  let game = currentGame();
  const category = game && catalog.byId.get(game.categoryId);
  if (!category) { clearGame(); return navigate("/"); }
  if (replay(game.bracket).champion) return navigate("/result");

  root.className = "view-match";
  let busy = false;

  // --- streamer mode state ---------------------------------------------------
  const tw = game.twitch;
  let tally = emptyTally();
  let deadline = 0; // ms timestamp when the vote closes, 0 = no timer running
  let ticker = null;
  let chat = null;
  let status = "connecting";

  function draw() {
    const s = replay(game.bracket);
    if (s.champion) return navigate("/result");
    const [a, b] = s.match;
    root.innerHTML = html`
      <section class="match-meta">
        <div class="match-cat">${localized(category.name, lang)}</div>
        <h1 class="round-title">${roundLabel(s)}</h1>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${s.totalPicks}" aria-valuenow="${s.picksMade}">
          <i style="width:${(100 * s.picksMade) / s.totalPicks}%"></i>
        </div>
        <div class="match-count">${t("match", { i: s.matchIndex + 1, n: s.matchesInRound })}</div>
      </section>
      <section class="arena">
        ${[a, b].map((e, side) => html`
          ${side === 1 ? html`<div class="vs" aria-hidden="true">VS</div>` : ""}
          <button class="duel-card side-${side}" data-side="${side}" aria-label="${e.name}">
            ${tw && html`<span class="vote-key">${side + 1}</span>`}
            ${picture(e, "duel-pic")}
            <span class="duel-name">${e.name}</span>
            ${e.sub && html`<span class="duel-sub">${e.sub}</span>`}
            ${e.info && html`<span class="duel-info">${localized(e.info, lang)}</span>`}
          </button>`)}
      </section>
      ${tw && html`
        <section class="chat-vote" aria-live="polite">
          <div class="vote-bar"><i data-bar="0"></i><i data-bar="1"></i></div>
          <div class="vote-info">
            <span data-count="0">0</span>
            <span class="vote-status" data-status></span>
            <span data-count="1">0</span>
          </div>
          <div class="row center"><button class="btn btn-small" data-close-vote>${t("closeVote")}</button></div>
        </section>`}
      <section class="match-actions">
        <button class="btn btn-ghost" data-undo ${game.bracket.choices.length ? "" : "disabled"}>↶ ${t("undo")}</button>
        <span class="hint">${tw ? t("chatHint", { channel: tw.channel }) : t("hint")}</span>
        <button class="btn btn-ghost" data-quit>${t("quit")}</button>
      </section>`;
    hydratePictures(root);
    // warm up the pictures of the next duel, whichever side wins
    for (const side of [0, 1]) prefetch(replay(choose(game.bracket, side)).match ?? []);
    if (tw) startVote();
  }

  function pick(side) {
    if (busy) return;
    busy = true;
    stopTimer();
    const cards = root.querySelectorAll(".duel-card");
    cards[side]?.classList.add("is-winner");
    cards[1 - side]?.classList.add("is-loser");
    setTimeout(() => {
      game = { ...game, bracket: choose(game.bracket, side) };
      saveGame(game);
      busy = false;
      draw();
    }, PICK_ANIMATION_MS);
  }

  function back() {
    if (busy || !game.bracket.choices.length) return;
    game = { ...game, bracket: undo(game.bracket) };
    saveGame(game);
    draw();
  }

  // --- chat voting -----------------------------------------------------------
  function startVote() {
    tally = emptyTally();
    stopTimer();
    deadline = tw.seconds ? Date.now() + tw.seconds * 1000 : 0;
    if (deadline) ticker = setInterval(tick, 250);
    renderVotes();
  }

  function stopTimer() {
    clearInterval(ticker);
    ticker = null;
    deadline = 0;
  }

  function tick() {
    if (Date.now() >= deadline) closeVote();
    else renderVotes();
  }

  /** Majority wins; on a tie or with no votes the streamer decides by clicking. */
  function closeVote() {
    stopTimer();
    const side = leader(tally);
    if (side === null) return renderVotes(t("tieDecide"));
    pick(side);
  }

  function renderVotes(note) {
    if (!tw) return;
    const [a, b] = tally.counts;
    const total = a + b;
    const share = (n) => (total ? (100 * n) / total : 50);
    const bar0 = $("[data-bar='0']", root), bar1 = $("[data-bar='1']", root);
    if (!bar0) return;
    bar0.style.width = `${share(a)}%`;
    bar1.style.width = `${share(b)}%`;
    $("[data-count='0']", root).textContent = a;
    $("[data-count='1']", root).textContent = b;
    const left = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null;
    const statusText = status === "live" ? (left !== null ? t("voteLeft", { s: left }) : t("voteOpen")) : t(`chat_${status}`);
    $("[data-status]", root).textContent = note ?? statusText;
  }

  if (tw) {
    try {
      chat = connectChat(tw.channel, {
        onStatus: (st) => { status = st; renderVotes(); },
        onMessage: (user, text) => {
          const side = voteFromText(text);
          if (side === null || busy) return;
          tally = addVote(tally, user, side);
          renderVotes();
        },
      });
    } catch {
      status = "closed";
    }
  }

  // --- input -----------------------------------------------------------------
  const onClick = (e) => {
    const card = e.target.closest("[data-side]");
    if (card) return pick(Number(card.dataset.side));
    if (e.target.closest("[data-close-vote]")) return closeVote();
    if (e.target.closest("[data-undo]")) return back();
    if (e.target.closest("[data-quit]")) navigate("/");
  };
  const onKey = (e) => {
    if (e.target.closest?.("input, textarea")) return;
    const k = e.key.toLowerCase();
    if (["arrowleft", "a", "1"].includes(k)) pick(0);
    else if (["arrowright", "d", "2"].includes(k)) pick(1);
    else if (["z", "backspace"].includes(k)) { e.preventDefault(); back(); }
    else if (tw && k === "v") closeVote();
  };

  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  draw();
  $(".duel-card", root)?.focus({ preventScroll: true });
  return () => {
    document.removeEventListener("keydown", onKey);
    stopTimer();
    chat?.close();
  };
}
