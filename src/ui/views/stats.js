// Rankings: the player's own history, per category (kept in this browser).
import { html } from "../dom.js";
import { t, lang } from "../../i18n.js";
import { localized } from "../../core/catalog.js";
import { topChampions, topByWinRate } from "../../core/stats.js";
import { load } from "../../services/storage.js";

export default function stats(root, { catalog }, [id]) {
  const all = load("stats", {});
  const played = catalog.categories.filter((c) => all[c.id]?.games);
  if (!played.length) {
    root.innerHTML = html`<p class="empty">${t("noStats")}</p>`;
    return;
  }
  const current = played.find((c) => c.id === id) ?? played[0];
  const cs = all[current.id];
  const date = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });

  root.innerHTML = html`
    <section class="stats">
      <aside class="stats-list panel">
        ${played.map((c) => html`
          <a href="#/stats/${c.id}" class="${c.id === current.id ? "active" : ""}">
            <span>${localized(c.name, lang)}</span><small>${t("games", { n: all[c.id].games })}</small>
          </a>`)}
      </aside>
      <div class="stats-body">
        <h1>${localized(current.name, lang)}</h1>
        <p class="muted">${t("games", { n: cs.games })}</p>
        <div class="stats-cols">
          <div class="panel">
            <h2 class="label">${t("titles")}</h2>
            <ol class="bars">
              ${topChampions(cs).map((c, i, arr) => html`
                <li><span>${c.name}</span><b>${c.titles}</b><i style="width:${(100 * c.titles) / arr[0].titles}%"></i></li>`)}
            </ol>
          </div>
          <div class="panel">
            <h2 class="label">${t("winRate")}</h2>
            <ol class="bars">
              ${topByWinRate(cs).map((c) => html`
                <li><span>${c.name}</span><b>${Math.round(c.rate * 100)}% <small>(${c.w}-${c.l})</small></b><i style="width:${c.rate * 100}%"></i></li>`)}
            </ol>
          </div>
        </div>
        <div class="panel">
          <h2 class="label">${t("recent")}</h2>
          <ul class="recent">
            ${cs.recent.map((g) => html`
              <li><time>${date.format(g.at)}</time> <span>🏆 ${g.podium[0]?.name}</span>
              <small>${g.podium.slice(1).map((p) => p.name).join(" · ")} · ${g.size}</small></li>`)}
          </ul>
        </div>
      </div>
    </section>`;
}
