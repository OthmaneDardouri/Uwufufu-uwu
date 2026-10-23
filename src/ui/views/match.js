// The duel screen. Click/tap a card, or use ← → (also A/D, 1/2). Z or Backspace undoes.
import { html, picture, hydratePictures, $ } from "../dom.js";
import { t, lang } from "../../i18n.js";
import { localized } from "../../core/catalog.js";
import { replay, choose, undo, roundKey } from "../../core/bracket.js";
import { currentGame, saveGame, clearGame } from "../../game.js";
import { prefetch } from "../../services/images.js";

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
            ${picture(e, "duel-pic")}
            <span class="duel-name">${e.name}</span>
            ${e.sub && html`<span class="duel-sub">${e.sub}</span>`}
          </button>`)}
      </section>
      <section class="match-actions">
        <button class="btn btn-ghost" data-undo ${game.bracket.choices.length ? "" : "disabled"}>↶ ${t("undo")}</button>
        <span class="hint">${t("hint")}</span>
        <button class="btn btn-ghost" data-quit>${t("quit")}</button>
      </section>`;
    hydratePictures(root);
    // warm up the pictures of the next duel, whichever side wins
    for (const side of [0, 1]) prefetch(replay(choose(game.bracket, side)).match ?? []);
  }

  function pick(side) {
    if (busy) return;
    busy = true;
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

  const onClick = (e) => {
    const card = e.target.closest("[data-side]");
    if (card) return pick(Number(card.dataset.side));
    if (e.target.closest("[data-undo]")) return back();
    if (e.target.closest("[data-quit]")) navigate("/");
  };
  const onKey = (e) => {
    if (e.target.closest?.("input, textarea")) return;
    const k = e.key.toLowerCase();
    if (["arrowleft", "a", "1"].includes(k)) pick(0);
    else if (["arrowright", "d", "2"].includes(k)) pick(1);
    else if (["z", "backspace"].includes(k)) { e.preventDefault(); back(); }
  };

  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  draw();
  $(".duel-card", root)?.focus({ preventScroll: true });
  return () => document.removeEventListener("keydown", onKey);
}
