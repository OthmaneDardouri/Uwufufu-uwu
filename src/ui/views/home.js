// Category browser: group filter, search, resume banner.
import { html, picture, hydratePictures, $, $$ } from "../dom.js";
import { t, lang } from "../../i18n.js";
import { localized } from "../../core/catalog.js";
import { replay } from "../../core/bracket.js";
import { currentGame, clearGame } from "../../game.js";
import { load, save } from "../../services/storage.js";

export default function home(root, { catalog }) {
  const { groups, categories, byId } = catalog;
  let group = load("homeGroup", "all");
  if (group !== "all" && !groups.some((g) => g.id === group)) group = "all";
  let query = "";

  const game = currentGame();
  const gameCat = game && byId.get(game.categoryId);
  const live = gameCat && !replay(game.bracket).champion ? replay(game.bracket) : null;

  root.innerHTML = html`
    <section class="hero">
      <h1 class="hero-title">${t("tagline")}</h1>
    </section>
    ${live && html`
      <section class="resume">
        <div>
          <strong>${t("resume")}</strong>
          <span>${t("resumeOf", { cat: localized(gameCat.name, lang), i: live.picksMade + 1, n: live.totalPicks })}</span>
        </div>
        <div class="row">
          <a class="btn btn-primary" href="#/match">${t("resume")}</a>
          <button class="btn btn-ghost" data-discard>${t("discard")}</button>
        </div>
      </section>`}
    <section class="filters">
      <div class="chips" role="tablist">
        ${[{ id: "all", name: t("all") }, ...groups].map((g) => html`
          <button class="chip" role="tab" data-group="${g.id}" aria-selected="${g.id === group}">${localized(g.name, lang)}</button>`)}
      </div>
      <input class="search" type="search" placeholder="${t("search")}" aria-label="${t("search")}">
    </section>
    <section class="grid" id="grid"></section>`;

  const grid = $("#grid", root);
  const groupName = new Map(groups.map((g) => [g.id, localized(g.name, lang)]));

  function renderGrid() {
    const q = query.trim().toLowerCase();
    const visible = categories.filter((c) =>
      (group === "all" || c.group === group) &&
      (!q || `${localized(c.name, "it")} ${localized(c.name, "en")}`.toLowerCase().includes(q)));
    grid.innerHTML = visible.length
      ? html`${visible.map((c) => html`
          <a class="cat-card ${c.accent ? `type-${c.accent}` : ""}" href="#/play/${c.id}">
            ${picture(c.cover ?? c.items?.[0], "cat-cover")}
            <div class="cat-body">
              <span class="cat-group">${groupName.get(c.group) ?? ""}</span>
              <h3>${localized(c.name, lang)}</h3>
              <span class="cat-size">${t("entrants", { n: c.size })}</span>
            </div>
          </a>`)}`
      : html`<p class="empty">∅</p>`;
    hydratePictures(grid);
  }

  root.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-group]");
    if (chip) {
      group = chip.dataset.group;
      save("homeGroup", group);
      $$("[data-group]", root).forEach((b) => b.setAttribute("aria-selected", b === chip));
      renderGrid();
    }
    if (e.target.closest("[data-discard]")) {
      clearGame();
      $(".resume", root)?.remove();
    }
  });
  $(".search", root).addEventListener("input", (e) => { query = e.target.value; renderGrid(); });
  renderGrid();
}
