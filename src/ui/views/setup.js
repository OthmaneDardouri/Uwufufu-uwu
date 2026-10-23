// Pre-game screen: pick how many entrants, then start.
import { html, picture, hydratePictures, $$ } from "../dom.js";
import { t, lang } from "../../i18n.js";
import { localized } from "../../core/catalog.js";
import { sizeOptions } from "../../core/bracket.js";
import { itemsOf } from "../../services/catalog.js";
import { startGame } from "../../game.js";
import { load, save } from "../../services/storage.js";

export default async function setup(root, { catalog, navigate }, [id]) {
  const category = catalog.byId.get(id);
  if (!category) return navigate("/");
  const items = await itemsOf(category);
  const sizes = sizeOptions(items.length);
  const remembered = load("lastSize", 16);
  let size = sizes.includes(remembered) ? remembered : sizes.find((s) => s >= 16) ?? sizes.at(-1);

  const info = () => t("rounds", { n: Math.ceil(Math.log2(size)), m: size - 1 });

  root.innerHTML = html`
    <section class="setup panel">
      ${picture(category.cover ?? items[0], "setup-cover")}
      <div class="setup-body">
        <a class="back" href="#/">← ${t("back")}</a>
        <h1>${localized(category.name, lang)}</h1>
        ${category.description && html`<p class="muted">${localized(category.description, lang)}</p>`}
        <h2 class="label">${t("howMany")}</h2>
        <div class="chips sizes">
          ${sizes.map((s) => html`<button class="chip" data-size="${s}" aria-pressed="${s === size}">
            ${s === items.length && ![8, 16, 32, 64, 128].includes(s) ? t("allN", { n: s }) : s}</button>`)}
        </div>
        <p class="muted small" data-info>${info()}</p>
        <button class="btn btn-primary btn-big" data-start>${t("start")}</button>
      </div>
    </section>`;
  hydratePictures(root);

  root.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-size]");
    if (chip) {
      size = Number(chip.dataset.size);
      $$("[data-size]", root).forEach((b) => b.setAttribute("aria-pressed", b === chip));
      root.querySelector("[data-info]").textContent = info();
    }
    if (e.target.closest("[data-start]")) {
      save("lastSize", size);
      startGame(category, items, size);
      navigate("/match");
    }
  });
}
