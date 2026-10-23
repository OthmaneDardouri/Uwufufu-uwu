// Champion screen. Records the game in the player's stats exactly once.
import { html, picture, hydratePictures, toast } from "../dom.js";
import { t, lang } from "../../i18n.js";
import { localized } from "../../core/catalog.js";
import { replay } from "../../core/bracket.js";
import { recordGame } from "../../core/stats.js";
import { currentGame, saveGame } from "../../game.js";
import { load, save } from "../../services/storage.js";
import { renderResultImage, shareOrDownload } from "../share.js";
import { supportUrl } from "../../services/api.js";

export default function result(root, { catalog, navigate }) {
  const game = currentGame();
  const category = game && catalog.byId.get(game.categoryId);
  const s = game && replay(game.bracket);
  if (!category || !s?.champion) return navigate("/");

  if (!game.recorded) {
    save("stats", recordGame(load("stats", {}), category.id, s));
    saveGame({ ...game, recorded: true });
  }

  const title = localized(category.name, lang);
  const [champ, ...rest] = s.ranking;
  root.className = "view-result";
  root.innerHTML = html`
    <section class="result">
      <p class="match-cat">${title}</p>
      <h1 class="round-title">${t("champion")}</h1>
      <div class="champion">
        ${picture(champ, "champion-pic")}
        <h2>${champ.name}</h2>
        ${champ.sub && html`<p class="muted">${champ.sub}</p>`}
        ${champ.info && html`<p class="champion-info">${localized(champ.info, lang)}</p>`}
      </div>
      <div class="podium">
        ${rest.slice(0, 3).map((e, i) => html`
          <div class="podium-step">
            ${picture(e, "podium-pic")}
            <span class="podium-rank">#${i + 2}</span>
            <span class="podium-name">${e.name}</span>
          </div>`)}
      </div>
      <div class="row center wrap">
        <a class="btn btn-primary" href="#/play/${category.id}">${t("again")}</a>
        <button class="btn" data-download>${t("download")}</button>
        <a class="btn btn-ghost" href="#/stats/${category.id}">${t("seeStats")}</a>
        <a class="btn btn-ghost" href="#/">${t("toHome")}</a>
      </div>
      ${supportUrl() && html`<a class="support" href="${supportUrl()}" target="_blank" rel="noopener">☕ ${t("supportText")}</a>`}
      <details class="ranking panel">
        <summary>${t("fullRanking")} (${s.ranking.length})</summary>
        <ol>${s.ranking.map((e) => html`<li>${e.name}</li>`)}</ol>
      </details>
    </section>`;
  hydratePictures(root);

  root.querySelector("[data-download]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const blob = await renderResultImage({
        title, ranking: s.ranking,
        labels: { champion: t("champion"), footer: `NEON BRACKET · ${location.host}` },
      });
      await shareOrDownload(blob, `neon-bracket-${category.id}.png`);
    } catch (err) {
      toast(t("error", { msg: err.message }), "error");
    } finally {
      btn.disabled = false;
    }
  });
}
