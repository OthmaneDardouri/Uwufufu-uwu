// Owner-only panel: create categories with Claude, import JSON, style transfer, manage what is published.
// Everything here goes through the server, which checks the admin token; the UI is just convenience.
import { html, picture, hydratePictures, toast, $ } from "../dom.js";
import { t, lang } from "../../i18n.js";
import { localized, validateCategory } from "../../core/catalog.js";
import { sanitizeTheme, repairTheme, COLOR_KEYS, FONTS, EFFECTS } from "../../core/theme.js";
import * as api from "../../services/api.js";
import { categoryPrompt, themePrompt, claudeUrl, extractJson, themesFromAnswer, categoryFromAnswer } from "../../core/prompts.js";
import { applyTheme, restoreTheme, listThemes, currentThemeId } from "../../services/themes.js";

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
  const state = { draft: null, variants: [], edit: null, busy: "", paste: null }; // paste: "category" | "theme" | null

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
            <label>${t("idea")}<textarea name="prompt" rows="3" maxlength="500" placeholder="${t("ideaPh")}"></textarea></label>
            <label>${t("count")}
              <select name="count">${[16, 32, 64, 128].map((n) => html`<option ${n === 32 ? "selected" : ""}>${n}</option>`)}</select>
            </label>
            <div class="row">
              <button class="btn btn-primary" ${ctx.server.ai && !state.busy ? "" : "disabled"} title="${t("viaApi")}">${state.busy === "cat" ? t("generating") : t("generate")}</button>
              <button type="button" class="btn" data-claude-cat title="${t("viaClaudeHelp")}">${t("viaClaude")}</button>
              <label class="btn btn-ghost file">${t("importJson")}<input type="file" accept="application/json,.json" data-import hidden></label>
            </div>
          </form>

          <form class="panel" data-theme-form>
            <h2 class="label">${t("styleTransfer")}</h2>
            <p class="muted small">${t("styleTransferHelp")}</p>
            <label>${t("themeImage")}<input type="file" name="image" accept="image/*" class="drop"></label>
            <label>${t("themeDesc")}<textarea name="prompt" rows="2" maxlength="500" placeholder="${t("themeDescPh")}"></textarea></label>
            <div class="row wrap">
              <label>${t("baseTheme")}
                <select name="base"><option value="">${t("noneOpt")}</option>
                  ${listThemes().map((th) => html`<option value="${th.id}">${localized(th.name, lang)}</option>`)}
                </select>
              </label>
              <label>${t("variants")}
                <select name="count">${[1, 2, 3, 4].map((n) => html`<option ${n === 3 ? "selected" : ""}>${n}</option>`)}</select>
              </label>
            </div>
            <div class="row wrap">
              <button class="btn btn-primary" ${ctx.server.ai && !state.busy ? "" : "disabled"} title="${t("viaApi")}">${state.busy === "theme" ? t("generating") : t("createVariants")}</button>
              <button type="button" class="btn" data-claude-theme title="${t("viaClaudeHelp")}">${t("viaClaude")}</button>
              <button type="button" class="btn btn-ghost" data-edit-base>${t("editByHand")}</button>
              <label class="btn btn-ghost file">${t("importJson")}<input type="file" accept="application/json,.json" data-import-theme hidden></label>
            </div>
          </form>
        </div>

        ${state.paste && pastePanel()}
        ${state.draft && draftEditor(state.draft)}
        ${state.variants.length ? variantsPanel() : ""}
        ${state.edit && themeEditor(state.edit)}

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

  function pastePanel() {
    return html`
      <form class="panel draft" data-paste>
        <h2 class="label">${t("pasteTitle")}</h2>
        <ol class="steps small">
          <li>${t("pasteStep1")}</li>
          ${state.paste === "theme" && state.pasteWithImage ? html`<li>${t("pasteStepImage")}</li>` : ""}
          <li>${t("pasteStep2")}</li>
          <li>${t("pasteStep3")}</li>
        </ol>
        <textarea name="answer" rows="8" placeholder="${t("pastePh")}" required></textarea>
        <div class="row wrap">
          <button class="btn btn-primary">${t("pasteLoad")}</button>
          <button type="button" class="btn btn-ghost" data-reopen-claude>${t("reopenClaude")}</button>
          <button type="button" class="btn btn-ghost" data-cancel-paste>${t("cancel")}</button>
        </div>
      </form>`;
  }

  const activeTheme = () => listThemes().find((th) => th.id === currentThemeId()) ?? listThemes()[0];

  /** Turn any pasted/imported theme answer into variants (several) or straight into the editor (one). */
  async function loadThemeAnswer(value) {
    const found = themesFromAnswer(value).map((raw, i) => repairTheme(raw, activeTheme(), i + 1));
    if (!found.length) throw new Error("no theme found in the answer");
    if (found.length === 1) {
      state.variants = [];
      state.edit = found[0].theme;
      applyTheme(found[0].theme);
      if (found[0].warnings.length) toast(found[0].warnings.join(" · "));
    } else {
      state.variants = found.map(({ theme, warnings, idea }) => ({ ...theme, idea, warnings }));
      state.edit = null;
      applyTheme(state.variants[0]);
    }
    await render();
    root.querySelector("[data-theme-editor], .variants")?.scrollIntoView({ behavior: "smooth" });
  }

  function loadCategoryAnswer(value) {
    const cat = categoryFromAnswer(value);
    if (!Array.isArray(cat.items)) throw new Error("the answer has no items list");
    const errors = validateCategory(cat);
    if (errors.length) throw Object.assign(new Error("Invalid category"), { details: errors });
    state.draft = { ...cat, items: [...cat.items] };
  }

  /** Open Claude.ai with the prompt pre-filled; also copy it, in case the pre-fill is not supported. */
  async function openClaude(prompt) {
    state.lastPrompt = prompt;
    try { await navigator.clipboard.writeText(prompt); toast(t("promptCopied")); } catch { /* clipboard blocked: the pre-filled link still works */ }
    window.open(claudeUrl(prompt), "_blank", "noopener");
  }

  function variantsPanel() {
    return html`
      <div class="panel">
        <h2 class="label">${t("chooseVariant")}</h2>
        <div class="variants">
          ${state.variants.map((v, i) => html`
            <div class="variant">
              ${swatches(v)}
              <b>${localized(v.name, lang)}</b>
              ${v.idea && html`<small class="muted">${v.idea}</small>`}
              <small>${v.fonts.display} / ${v.fonts.body} · ${v.effects.background} · ${v.effects.title}</small>
              ${v.warnings?.length ? html`<small class="notice">${v.warnings.join(" · ")}</small>` : ""}
              <div class="row wrap">
                <button class="btn btn-small" data-preview="${i}">${t("preview")}</button>
                <button class="btn btn-small btn-primary" data-choose="${i}">${t("chooseEdit")}</button>
              </div>
            </div>`)}
        </div>
        <button class="btn btn-ghost btn-small" data-discard-variants>${t("cancel")}</button>
      </div>`;
  }

  const sel = (name, options, value) => html`<select name="${name}">${options.map((o) => html`<option ${o === value ? "selected" : ""}>${o}</option>`)}</select>`;

  function themeEditor(th) {
    return html`
      <form class="panel draft" data-theme-editor>
        <h2 class="label">${t("themeEditor")}</h2>
        <p class="muted small">${t("themePreviewHelp")}</p>
        <div class="row wrap">
          <label>id<input name="id" value="${th.id}" pattern="[a-z0-9][a-z0-9-]{1,63}" required></label>
          <label>${t("nameIt")}<input name="name_it" value="${localized(th.name, "it")}" required></label>
          <label>${t("nameEn")}<input name="name_en" value="${localized(th.name, "en")}" required></label>
        </div>
        <h3 class="label">${t("colorsLabel")}</h3>
        <div class="theme-grid">
          ${COLOR_KEYS.map((k) => html`<label class="color">${t(`color_${k}`)}<input type="color" name="c-${k}" value="${th.colors[k]}"></label>`)}
        </div>
        <h3 class="label">${t("fontsLabel")}</h3>
        <div class="theme-grid">
          <label>${t("fontDisplay")}${sel("font-display", FONTS, th.fonts.display)}</label>
          <label>${t("fontBody")}${sel("font-body", FONTS, th.fonts.body)}</label>
          <label>${t("tracking")}<input type="number" name="tracking" min="-0.05" max="0.4" step="0.01" value="${th.effects.tracking}"></label>
          <label>${t("caseLabel")}${sel("case", EFFECTS.case, th.effects.case)}</label>
        </div>
        <h3 class="label">${t("shapeLabel")}</h3>
        <div class="theme-grid">
          <label>${t("cornersLabel")}${sel("corners", EFFECTS.corners, th.shape.corners)}</label>
          <label>${t("radiusLabel")}<input type="number" name="radius" min="0" max="32" value="${th.shape.radius}"></label>
          <label>${t("borderLabel")}${sel("border", EFFECTS.border, th.shape.border)}</label>
          <label>${t("borderWidth")}<input type="number" name="borderWidth" min="0" max="6" value="${th.shape.borderWidth}"></label>
        </div>
        <h3 class="label">${t("effectsLabel")}</h3>
        <div class="theme-grid">
          <label>${t("bgLabel")}${sel("background", EFFECTS.background, th.effects.background)}</label>
          <label>${t("titleLabel")}${sel("title", EFFECTS.title, th.effects.title)}</label>
          <label>${t("shadowLabel")}${sel("shadow", EFFECTS.shadow, th.effects.shadow)}</label>
        </div>
        <div class="row wrap">
          <button class="btn btn-primary">${t("publish")}</button>
          <button type="button" class="btn btn-ghost" data-export-theme>${t("exportJson")}</button>
          <button type="button" class="btn btn-ghost" data-cancel-theme>${t("cancel")}</button>
        </div>
      </form>`;
  }

  /** Read the editor form back into a theme object. */
  function themeFromForm(form) {
    const f = new FormData(form);
    const num = (k) => Number(f.get(k));
    return sanitizeTheme({
      id: f.get("id"),
      name: { it: f.get("name_it"), en: f.get("name_en") },
      colors: Object.fromEntries(COLOR_KEYS.map((k) => [k, f.get(`c-${k}`)])),
      fonts: { display: f.get("font-display"), body: f.get("font-body") },
      shape: { corners: f.get("corners"), radius: num("radius"), border: f.get("border"), borderWidth: num("borderWidth") },
      effects: { background: f.get("background"), title: f.get("title"), shadow: f.get("shadow"), case: f.get("case"), tracking: num("tracking") },
    });
  }

  const copyTheme = (th, suffix) => ({
    ...structuredClone({ colors: th.colors, fonts: th.fonts, shape: th.shape, effects: th.effects }),
    id: th.id.startsWith("ai-") || th.remote ? th.id : `${th.id}-${suffix}`.slice(0, 64),
    name: typeof th.name === "string" ? { it: th.name, en: th.name } : { ...th.name },
  });

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
      if (String(data.get("prompt") ?? "").trim().length < 3) return toast(t("ideaNeeded"), "error");
      run("cat", async () => { state.draft = await api.generateCategory(data.get("prompt"), Number(data.get("count"))); });
    }
    if (form.matches("[data-theme-form]")) {
      const file = data.get("image");
      const prompt = String(data.get("prompt") ?? "").trim();
      const base = listThemes().find((th) => th.id === data.get("base"));
      if (!file?.size && !prompt && !base) return toast(t("themeNeedsInput"), "error");
      run("theme", async () => {
        const image = file?.size ? await imageToDataUrl(file) : undefined;
        const strip = base && { id: base.id, name: base.name, colors: base.colors, fonts: base.fonts, shape: base.shape, effects: base.effects };
        state.variants = await api.generateThemes({ image, prompt, base: strip, count: Number(data.get("count")) });
        state.edit = null;
        if (state.variants[0]) applyTheme(state.variants[0]); // preview the first one right away
      });
    }
    if (form.matches("[data-paste]")) {
      try {
        const value = extractJson(data.get("answer"));
        const kind = state.paste;
        state.paste = null;
        if (kind === "category") {
          loadCategoryAnswer(value);
          await render();
        } else {
          await loadThemeAnswer(value);
        }
      } catch (err) { fail(err); }
    }
    if (form.matches("[data-theme-editor]")) {
      const { theme, errors } = themeFromForm(form);
      if (errors.length) return fail(Object.assign(new Error("Invalid theme"), { details: errors }));
      try {
        await api.saveTheme(theme);
        state.edit = null;
        state.variants = [];
        await ctx.reloadThemes();
        toast(t("published"));
        await render();
      } catch (err) { fail(err); }
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
    if (el.matches("[data-claude-cat]")) {
      const form = root.querySelector("[data-generate]");
      const idea = form.querySelector("[name=prompt]").value.trim();
      if (idea.length < 3) return toast(t("ideaNeeded"), "error");
      await openClaude(categoryPrompt(idea, Number(form.querySelector("[name=count]").value)));
      state.paste = "category";
      await render();
      return root.querySelector("[data-paste]")?.scrollIntoView({ behavior: "smooth" });
    }
    if (el.matches("[data-claude-theme]")) {
      const form = root.querySelector("[data-theme-form]");
      const description = form.querySelector("[name=prompt]").value.trim();
      const baseTheme = listThemes().find((th) => th.id === form.querySelector("[name=base]").value);
      const withImage = !!form.querySelector("[name=image]").files?.length;
      if (!description && !baseTheme && !withImage) return toast(t("themeNeedsInput"), "error");
      const base = baseTheme && { name: baseTheme.name, colors: baseTheme.colors, fonts: baseTheme.fonts, shape: baseTheme.shape, effects: baseTheme.effects };
      await openClaude(themePrompt({ description, base, withImage, count: Number(form.querySelector("[name=count]").value) }));
      state.paste = "theme";
      state.pasteWithImage = withImage;
      await render();
      return root.querySelector("[data-paste]")?.scrollIntoView({ behavior: "smooth" });
    }
    if (el.matches("[data-reopen-claude]")) return state.lastPrompt && openClaude(state.lastPrompt);
    if (el.matches("[data-cancel-paste]")) { state.paste = null; return render(); }
    if (el.matches("[data-preview]")) return applyTheme(state.variants[Number(el.dataset.preview)]);
    if (el.matches("[data-choose]")) {
      state.edit = copyTheme(state.variants[Number(el.dataset.choose)], "v");
      applyTheme(state.edit);
      await render();
      return root.querySelector("[data-theme-editor]")?.scrollIntoView({ behavior: "smooth" });
    }
    if (el.matches("[data-discard-variants]")) { state.variants = []; restoreTheme(); return render(); }
    if (el.matches("[data-edit-base]")) {
      const form = root.querySelector("[data-theme-form]");
      const id = form.querySelector("[name=base]").value || currentThemeId();
      state.edit = copyTheme(listThemes().find((th) => th.id === id), "custom");
      applyTheme(state.edit);
      await render();
      return root.querySelector("[data-theme-editor]")?.scrollIntoView({ behavior: "smooth" });
    }
    if (el.matches("[data-export-theme]")) {
      const { theme } = themeFromForm(root.querySelector("[data-theme-editor]"));
      return download(theme, `${theme.id}.json`);
    }
    if (el.matches("[data-cancel-theme]")) { state.edit = null; restoreTheme(); return render(); }
    if (el.matches("[data-delete-theme]")) {
      const th = listThemes().find((x) => x.id === el.dataset.deleteTheme);
      if (!confirm(t("confirmDelete", { name: localized(th.name, lang) }))) return;
      try { await api.deleteTheme(th.id); await ctx.reloadThemes(); await render(); } catch (err) { fail(err); }
    }
  });

  // live preview: every change in the theme editor repaints the whole site
  root.addEventListener("input", (e) => {
    const form = e.target.closest("[data-theme-editor]");
    if (!form) return;
    const { theme } = themeFromForm(form);
    state.edit = theme;
    applyTheme(theme);
  });

  root.addEventListener("change", async (e) => {
    if (e.target.matches("[data-import-theme]")) {
      try { await loadThemeAnswer(extractJson(await e.target.files[0].text())); } catch (err) { fail(err); }
      e.target.value = "";
      return;
    }
    if (!e.target.matches("[data-import]")) return;
    try {
      loadCategoryAnswer(extractJson(await e.target.files[0].text()));
      await render();
    } catch (err) { fail(err); }
    e.target.value = "";
  });

  render();
  return () => { if (state.edit || state.variants.length) restoreTheme(); };
}
