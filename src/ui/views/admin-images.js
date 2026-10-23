// Admin picture tool: for every item of a category, show which picture the server found,
// where it came from and why a source failed; let the admin paste a picture by hand.
import { html, toast, $ } from "../dom.js";
import { t, lang } from "../../i18n.js";
import { localized } from "../../core/catalog.js";
import { generatedArt } from "../../core/art.js";
import { itemsOf } from "../../services/catalog.js";
import { imageQuery } from "../../services/images.js";
import * as api from "../../services/api.js";

export default function adminImages(root, ctx, params) {
  if (!api.adminToken() || !ctx.server?.admin) return ctx.navigate("/admin");
  if (!api.hasImageServer()) {
    root.innerHTML = html`<p class="empty">${t("imagesNoServer")}</p>`;
    return;
  }
  const cats = ctx.catalog.categories.filter((c) => !c.source); // Pokémon categories use official artwork
  let running = false;
  let stop = false;
  let items = [];

  root.innerHTML = html`
    <section class="admin">
      <div class="row between wrap">
        <h1>${t("imagesTitle")}</h1>
        <a class="btn btn-ghost" href="#/admin">← ${t("adminTitle")}</a>
      </div>
      <p class="muted small">${t("imagesHelp")}</p>
      <div class="row wrap">
        <select data-cat>${cats.map((c) => html`<option value="${c.id}" ${c.id === params[0] ? "selected" : ""}>${localized(c.name, lang)}</option>`)}</select>
        <button class="btn btn-primary" data-check>${t("imagesCheck")}</button>
      </div>
      <p class="small" data-summary></p>
      <ul class="img-rows" data-rows></ul>
    </section>`;

  const rowsEl = $("[data-rows]", root);
  const summary = $("[data-summary]", root);

  function rowHtml(item, r) {
    const pic = r?.proxied ?? generatedArt(item.name); // proxied paths are same-origin; manual pictures are full URLs
    const problems = (r?.tried ?? []).filter((x) => x.error).map((x) => `${x.source}: ${x.error}`);
    const misses = (r?.tried ?? []).filter((x) => !x.error && !x.ok).map((x) => x.source);
    return html`
      <img src="${pic}" alt="" loading="lazy">
      <div class="img-meta">
        <b>${item.name}</b>
        <small>${r ? (r.source ? html`<span class="badge ok">${r.source}</span>` : html`<span class="badge no">${t("imagesNone")}</span>`) : t("loading")}
          ${misses.length ? html` · ${t("imagesNotFound")}: ${misses.join(", ")}` : ""}</small>
        ${problems.length ? html`<small class="img-error">${problems.join(" · ")}</small>` : ""}
      </div>
      <form class="img-fix" data-key="${r?.key ?? ""}">
        <input name="url" type="url" placeholder="${t("imagesPaste")}" ${r?.key ? "" : "disabled"}>
        <button class="btn btn-small" ${r?.key ? "" : "disabled"}>${t("save")}</button>
        ${r?.source === "manual" ? html`<button type="button" class="btn btn-small btn-ghost" data-unset="${r.key}">${t("remove")}</button>` : ""}
      </form>`;
  }

  async function check() {
    if (running) { stop = true; return; }
    const category = ctx.catalog.byId.get($("[data-cat]", root).value);
    items = await itemsOf(category);
    running = true; stop = false;
    $("[data-check]", root).textContent = t("imagesStop");
    rowsEl.innerHTML = html`${items.map((it, i) => html`<li data-row="${i}">${rowHtml(it, null)}</li>`)}`;
    let found = 0, done = 0;
    for (const [i, item] of items.entries()) {
      if (stop) break;
      let r;
      try { r = await api.imageLookup(imageQuery(item), true); } catch (err) { r = { tried: [{ source: "server", error: err.message }] }; }
      const li = rowsEl.querySelector(`[data-row="${i}"]`);
      li.innerHTML = rowHtml(item, r);
      done++; if (r.source) found++;
      summary.textContent = t("imagesSummary", { found, done, total: items.length });
    }
    running = false;
    $("[data-check]", root).textContent = t("imagesCheck");
  }

  root.addEventListener("click", async (e) => {
    if (e.target.closest("[data-check]")) return check();
    const unset = e.target.closest("[data-unset]");
    if (unset) {
      try {
        await api.deleteImageOverride(unset.dataset.unset);
        const li = unset.closest("li");
        li.innerHTML = rowHtml(items[li.dataset.row], { key: unset.dataset.unset, tried: [] });
        toast(t("imagesRemoved"));
      } catch (err) { toast(err.message, "error"); }
    }
  });
  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target.closest(".img-fix");
    const url = new FormData(form).get("url");
    try {
      await api.saveImageOverride(form.dataset.key, url);
      const li = form.closest("li");
      li.innerHTML = rowHtml(items[li.dataset.row], { proxied: url, source: "manual", key: form.dataset.key });
      toast(t("imagesSaved"));
    } catch (err) { toast(t("error", { msg: [err.message, ...(err.details ?? [])].join(" · ") }), "error"); }
  });
  return () => { stop = true; };
}
