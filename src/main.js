// App shell + hash router. Each route maps to a view: (root, ctx, params) => cleanup?
import { initApi, health, adminToken } from "./services/api.js";
import { loadCatalog } from "./services/catalog.js";
import { loadThemes, listThemes, currentThemeId, useTheme, restoreTheme } from "./services/themes.js";
import { localized } from "./core/catalog.js";
import { lang, setLang, LANGS, t } from "./i18n.js";
import { html, $ } from "./ui/dom.js";
import home from "./ui/views/home.js";
import setup from "./ui/views/setup.js";
import match from "./ui/views/match.js";
import result from "./ui/views/result.js";
import stats from "./ui/views/stats.js";
import admin from "./ui/views/admin.js";

const ROUTES = [
  [/^\/?$/, home],
  [/^\/play\/([a-z0-9-]+)$/, setup],
  [/^\/match$/, match],
  [/^\/result$/, result],
  [/^\/stats(?:\/([a-z0-9-]+))?$/, stats],
  [/^\/admin$/, admin],
];

const ctx = {
  catalog: null,
  server: null, // { ok, admin, ai } when a server is reachable
  navigate: (path) => { location.hash = `#${path}`; },
  reloadCatalog: async () => { ctx.catalog = await loadCatalog(); },
  reloadThemes: async () => { await loadThemes(); restoreTheme(); shell(); markActive(); },
  refreshShell: () => { shell(); markActive(); },
};

let cleanup = null;

/** Renders the top bar only, so it can be refreshed without touching the current view. */
function shell() {
  const top = $("#top");
  const nav = [["/", "play"], ["/stats", "stats"],
    // the admin link only shows on the owner's devices; #/admin still works if typed
    ...(ctx.server?.admin && adminToken() ? [["/admin", "admin"]] : [])];
  top.innerHTML = html`
    <a class="brand" href="#/" aria-label="Neon Bracket">NEON<span>BRACKET</span></a>
    <nav class="nav">
      ${nav.map(([href, key]) => html`<a href="#${href}" data-nav="${href}">${t(key)}</a>`)}
      <label class="theme-pick" title="${t("theme")}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>
        <select aria-label="${t("theme")}">
          ${listThemes().map((th) => html`<option value="${th.id}" ${th.id === currentThemeId() ? "selected" : ""}>${localized(th.name, lang)}</option>`)}
        </select>
      </label>
      <button class="lang" type="button" aria-label="${t("language")}">${LANGS.find((l) => l !== lang).toUpperCase()}</button>
    </nav>`;
  $(".theme-pick select", top).addEventListener("change", (e) => useTheme(e.target.value));
  $(".lang", top).addEventListener("click", () => {
    setLang(LANGS.find((l) => l !== lang));
    shell();
    route();
  });
}

const currentPath = () => decodeURIComponent(location.hash.slice(1)) || "/";

function markActive() {
  const path = currentPath();
  for (const a of document.querySelectorAll("[data-nav]")) {
    const href = a.dataset.nav;
    a.classList.toggle("active", href === "/" ? path === "/" || path.startsWith("/play") : path.startsWith(href));
  }
}

async function route() {
  const path = currentPath();
  const [, view, params] = ROUTES.map(([re, v]) => [re, v, path.match(re)]).find(([, , m]) => m) ?? [null, home, []];
  markActive();
  if (typeof cleanup === "function") cleanup();
  // a fresh element per route drops every listener the previous view attached
  const old = $("#view");
  const root = document.createElement("main");
  root.id = "view";
  old.replaceWith(root);
  try {
    cleanup = await view(root, ctx, params?.slice?.(1) ?? []);
  } catch (err) {
    console.error(err);
    root.innerHTML = html`<p class="empty">${t("error", { msg: err.message })}</p>`;
  }
  window.scrollTo({ top: 0 });
}

async function boot() {
  setLang(lang);
  await initApi();
  [ctx.server] = await Promise.all([health(), loadThemes().catch(() => [])]);
  restoreTheme();
  shell();
  $("#view").innerHTML = html`<p class="empty">${t("loading")}</p>`;
  ctx.catalog = await loadCatalog();
  window.addEventListener("hashchange", route);
  await route();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
