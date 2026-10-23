// Owner-only panel: create categories with Claude, import JSON, style transfer, manage what is published.
// Everything here goes through the server, which checks the admin token; the UI is just convenience.
import { html, picture, hydratePictures, toast, $ } from "../dom.js";
import { t, lang } from "../../i18n.js";
import { localized, validateCategory } from "../../core/catalog.js";
import { sanitizeTheme, COLOR_KEYS } from "../../core/theme.js";
import * as api from "../../services/api.js";
import { applyTheme, restoreTheme, listThemes } from "../../services/themes.js";

const MAX_IMAGE_SIDE = 1024;

/** Downscale an uploaded picture before sending it: smaller request, same style information. */
function imageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("unreadable image"));
    img.src = URL.createObjectURL(file);
  });
}

function download(obj, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export default function admin(root, ctx) {
  const state = { draft: null, themeDraft: null, busy: "" };

  async function render() {
    if (!ctx.server?.admin) {
      root.innerHTML = html`<p class="empty">${t("noServer")}</p>`;
      return;
    }
    if (!api.adminToken()) return renderLogin();
    const remoteCats = ctx.catalog.categories.filter((c) => c.remote);
    const remoteThemes = listThemes().filter((th) => th.remote);

    root.innerHTML = html`
      <section class="admin">
        <div class="row between">
          <h1>${t("adminTitle")}</h1>
          <button class="btn btn-ghost" data-logout>${t("logout")}</button>
        </div>
        ${!ctx.server.ai && html`<p class="notice">${t("noAi")}</p>`}

        <div class="admin-grid">
          <form class="panel" data-generate>
            <h2 class="label">${t("newCategory")}</h2>
            <label>${t("idea")}<textarea name="prompt" rows="3" required minlength="3" maxlength="500" placeholder="${t("ideaPh")}" ${ctx.server.ai ? "" : "disabled"}></textarea></label>
            <label>${t("count")}
              <select name="count">${[16, 32, 64, 128].map((n) => html`<option ${n === 32 ? "selected" : ""}>${n}</option>`)}</select>
            </label>
            <div class="row">
              <button class="btn btn-primary" ${ctx.server.ai && !state.busy ? "" : "disabled"}>${state.busy === "cat" ? t("generating") : t("generate")}</button>
              <label class="btn btn-ghost file">${t("importJson")}<input type="file" accept="application/json,.json" data-import hidden></label>
            </div>
          </form>

          <form class="panel" data-theme-form>
            <h2 class="label">${t("styleTransfer")}</h2>
            <p class="muted small">${t("styleTransferHelp")}</p>
            <label class="drop">
              <input type="file" name="image" accept="image/*" required ${ctx.server.ai ? "" : "disabled"}>
            </label>
            <label>${t("styleHint")}<input name="hint" maxlength="300" placeholder="${t("styleHintPh")}"></label>
            <button class="btn btn-primary" ${ctx.server.ai && !state.busy ? "" : "disabled"}>${state.busy === "theme" ? t("generating") : t("generateTheme")}</button>
          </form>
        </div>

        ${state.draft && draftEditor(state.draft)}
        ${state.themeDraft && themeEditor(state.themeDraft)}

        <div class="admin-grid">
          <div class="panel">
            <h2 class="label">${t("yourCats")}</h2>
            ${remoteCats.length ? html`<ul class="admin-list">${remoteCats.map((c) => html`
              <li><span>${localized(c.name, lang)} <small>· ${c.size}</small></span>
                <span class="row"><button class="btn btn-small" data-export="${c.id}">${t("exportJson")}</button>
                <button class="btn btn-small btn-danger" data-delete-cat="${c.id}">${t("delete")}</button></span></li>`)}</ul>`
              : html`<p class="muted small">—</p>`}
          </div>
          <div class="panel">
            <h2 class="label">${t("yourThemes")}</h2>
            ${remoteThemes.length ? html`<ul class="admin-list">${remoteThemes.map((th) => html`
              <li><span>${swatches(th)} ${localized(th.name, lang)}</span>
                <button class="btn btn-small btn-danger" data-delete-theme="${th.id}">${t("delete")}</button></li>`)}</ul>`
              : html`<p class="muted small">—</p>`}
          </div>
        </div>
      </section>`;
    hydratePictures(root);
  }

  const swatches = (th) => html`<span class="swatches">${COLOR_KEYS.map((k) => html`<i style="background:${th.colors[k]}"></i>`)}</span>`;

  function draftEditor(d) {
    const errors = validateCategory(d);
    return html`
      <form class="panel draft" data-draft>
        <h2 class="label">${t("review")} · ${d.items.length}</h2>
        <div class="row wrap">
          <label>id<input name="id" value="${d.id}" pattern="[a-z0-9][a-z0-9-]{1,63}" required></label>
          <label>${t("nameIt")}<input name="name_it" value="${localized(d.name, "it")}" required></label>
          <label>${t("nameEn")}<input name="name_en" value="${localized(d.name, "en")}" required></label>
        </div>
        <ul class="draft-items">
          ${d.items.map((it, i) => html`
            <li>${picture(it, "draft-pic")}<span><b>${it.name}</b><small>${it.sub ?? ""}</small>${it.info && html`<small class="draft-info">${localized(it.info, lang)}</small>`}</span>
              <button type="button" class="btn btn-small btn-ghost" data-remove="${i}" aria-label="${t("remove")}">✕</button></li>`)}
        </ul>
        ${errors.length ? html`<p class="notice">${errors.join(" · ")}</p>` : ""}
        <div class="row">
          <button class="btn btn-primary" ${errors.length ? "disabled" : ""}>${t("publish")}</button>
          <button type="button" class="btn btn-ghost" data-export-draft>${t("exportJson")}</button>
          <button type="button" class="btn btn-ghost" data-cancel-draft>${t("cancel")}</button>
        </div>
      </form>`;
  }

  function themeEditor({ theme, warnings }) {
    return html`
      <div class="panel draft">
        <h2 class="label">${t("themePreview")}: ${localized(theme.name, lang)}</h2>
        <p class="muted small">${t("themePreviewHelp")}</p>
        ${swatches(theme)}
        <p class="small">${theme.fonts.display} / ${theme.fonts.body} · ${Object.values(theme.effects).join(" · ")}</p>
        ${warnings?.length ? html`<p class="notice">${warnings.join(" · ")}</p>` : ""}
        <div class="row">
          <button class="btn btn-primary" data-publish-theme>${t("publish")}</button>
          <button class="btn btn-ghost" data-cancel-theme>${t("cancel")}</button>
        </div>
      </div>`;
  }

  function renderLogin() {
    root.innerHTML = html`
      <form class="panel narrow" data-login>
        <h1>${t("adminTitle")}</h1>
        <p class="muted">${t("adminIntro")}</p>
        <label>${t("token")}<input type="password" name="token" autocomplete="current-password" required></label>
        <button class="btn btn-primary">${t("login")}</button>
      </form>`;
  }

  const fail = (err) => toast(t("error", { msg: [err.message, ...(err.details ?? [])].join(" · ") }), "error");

  async function run(kind, fn) {
    state.busy = kind;
    await render();
    try { await fn(); } catch (err) { fail(err); }
    state.busy = "";
    await render();
  }

  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    if (form.matches("[data-login]")) {
      api.setAdminToken(data.get("token"));
      try {
        await api.checkAdmin();
        ctx.refreshShell();
        await render();
      } catch (err) {
        api.setAdminToken("");
        toast(err.status === 401 ? t("wrongToken") : err.message, "error");
      }
    }
    if (form.matches("[data-generate]")) {
      run("cat", async () => { state.draft = await api.generateCategory(data.get("prompt"), Number(data.get("count"))); });
    }
    if (form.matches("[data-theme-form]")) {
      const file = data.get("image");
      if (!file?.size) return;
      run("theme", async () => {
        const res = await api.generateTheme(await imageToDataUrl(file), data.get("hint"));
        const { theme, errors } = sanitizeTheme(res);
        state.themeDraft = { theme, warnings: errors };
        applyTheme(theme); // live preview on the whole site
      });
    }
    if (form.matches("[data-draft]")) {
      const d = { ...state.draft, id: data.get("id"), name: { it: data.get("name_it"), en: data.get("name_en") } };
      try {
        await api.saveCategory(d);
        state.draft = null;
        await ctx.reloadCatalog();
        toast(t("published"));
        await render();
      } catch (err) { fail(err); }
    }
  });

  root.addEventListener("click", async (e) => {
    const el = e.target.closest("button, [data-export]");
    if (!el) return;
    if (el.matches("[data-logout]")) { api.setAdminToken(""); ctx.refreshShell(); return render(); }
    if (el.matches("[data-remove]")) {
      state.draft.items.splice(Number(el.dataset.remove), 1);
      return render();
    }
    if (el.matches("[data-cancel-draft]")) { state.draft = null; return render(); }
    if (el.matches("[data-export-draft]")) return download(state.draft, `${state.draft.id}.json`);
    if (el.matches("[data-export]")) {
      const { size, remote, createdAt, updatedAt, ...c } = ctx.catalog.byId.get(el.dataset.export);
      return download(c, `${c.id}.json`);
    }
    if (el.matches("[data-delete-cat]")) {
      const c = ctx.catalog.byId.get(el.dataset.deleteCat);
      if (!confirm(t("confirmDelete", { name: localized(c.name, lang) }))) return;
      try { await api.deleteCategory(c.id); await ctx.reloadCatalog(); await render(); } catch (err) { fail(err); }
    }
    if (el.matches("[data-publish-theme]")) {
      try {
        await api.saveTheme(state.themeDraft.theme);
        state.themeDraft = null;
        await ctx.reloadThemes();
        toast(t("published"));
        await render();
      } catch (err) { fail(err); }
    }
    if (el.matches("[data-cancel-theme]")) { state.themeDraft = null; restoreTheme(); return render(); }
    if (el.matches("[data-delete-theme]")) {
      const th = listThemes().find((x) => x.id === el.dataset.deleteTheme);
      if (!confirm(t("confirmDelete", { name: localized(th.name, lang) }))) return;
      try { await api.deleteTheme(th.id); await ctx.reloadThemes(); await render(); } catch (err) { fail(err); }
    }
  });

  root.addEventListener("change", async (e) => {
    if (!e.target.matches("[data-import]")) return;
    try {
      const parsed = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(parsed.items)) throw new Error("only categories with an items list can be imported here");
      const errors = validateCategory({ group: "custom", ...parsed });
      if (errors.length) throw Object.assign(new Error("Invalid category"), { details: errors });
      state.draft = { group: "custom", ...parsed, items: [...parsed.items] };
      await render();
    } catch (err) { fail(err); }
  });

  render();
  return () => { if (state.themeDraft) restoreTheme(); };
}
